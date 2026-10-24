import type { Db } from "./db.ts";
import type { FetchOdds, OddsEvent } from "./odds-api.ts";

/** Sharp, high-liquidity books first: their moves are the most informative. Fallback: alphabetical. */
export const PREFERRED_BOOKMAKERS = ["pinnacle", "betfair_ex_eu", "unibet_eu", "williamhill"];
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

type Selection = "home" | "draw" | "away";
interface Row {
  bookmaker: string;
  selection: Selection;
  odds: number;
  observedAt: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Validates and normalises one event's 1X2 prices. Incomplete or implausible markets are dropped whole. */
export function h2hRows(e: OddsEvent, now: Date): Row[] {
  const rows: Row[] = [];
  for (const b of e.bookmakers) {
    const m = b.markets.find((x) => x.key === "h2h");
    if (!m) continue;
    const observedAt = m.last_update ?? b.last_update;
    if (Date.parse(observedAt) > now.getTime() + MAX_CLOCK_SKEW_MS) continue;
    const bySel = new Map<Selection, number>();
    for (const o of m.outcomes) {
      const sel: Selection | null = o.name === e.home_team ? "home" : o.name === e.away_team ? "away" : o.name === "Draw" ? "draw" : null;
      if (sel && Number.isFinite(o.price) && o.price > 1) bySel.set(sel, o.price);
    }
    if (bySel.size !== 3 || m.outcomes.length !== 3) continue;
    for (const [selection, odds] of bySel) rows.push({ bookmaker: b.key, selection, odds, observedAt });
  }
  return rows;
}

export function pickReferenceBookmaker(keys: string[]): string | null {
  return PREFERRED_BOOKMAKERS.find((k) => keys.includes(k)) ?? [...keys].sort()[0] ?? null;
}

/** Upserts teams + match, inserts new price observations. Returns how many observations were new. */
async function saveEvent(db: Db, competitionId: number, e: OddsEvent, now: Date): Promise<number> {
  const teams = (
    await db.query<{ id: number; odds_api_name: string }>(
      `insert into public.teams (odds_api_name, name, short_name) values ($1, $1, $1), ($2, $2, $2)
       on conflict (odds_api_name) do update set odds_api_name = excluded.odds_api_name
       returning id, odds_api_name`,
      [e.home_team, e.away_team],
    )
  ).rows;
  const teamId = (name: string) => teams.find((t) => t.odds_api_name === name)!.id;
  const rows = h2hRows(e, now);

  const [{ id: matchId }] = (
    await db.query<{ id: number }>(
      `insert into public.matches (external_id, competition_id, home_team_id, away_team_id, kickoff_at, reference_bookmaker, last_synced_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (external_id) do update set
         kickoff_at = excluded.kickoff_at,
         -- A postponed match that gets a new date is back on the schedule.
         status = case when public.matches.status = 'postponed' and excluded.kickoff_at <> public.matches.kickoff_at
                       then 'scheduled' else public.matches.status end,
         last_synced_at = excluded.last_synced_at,
         reference_bookmaker = coalesce(public.matches.reference_bookmaker, excluded.reference_bookmaker)
       returning id`,
      [e.id, competitionId, teamId(e.home_team), teamId(e.away_team), e.commence_time,
        pickReferenceBookmaker([...new Set(rows.map((r) => r.bookmaker))]), now.toISOString()],
    )
  ).rows;

  await db.query(
    "update public.matches set reference_seen_at = $2 where id = $1 and reference_bookmaker = any($3::text[])",
    [matchId, now.toISOString(), [...new Set(rows.map((r) => r.bookmaker))]],
  );
  if (rows.length === 0) return 0;
  const inserted = await db.query(
    `insert into public.odds_snapshots (match_id, bookmaker, market_key, selection_key, odds_value, observed_at)
     select $1, b, 'h2h', s, o, t from unnest($2::text[], $3::text[], $4::numeric[], $5::timestamptz[]) as x(b, s, o, t)
     on conflict do nothing
     returning 1`,
    [matchId, rows.map((r) => r.bookmaker), rows.map((r) => r.selection), rows.map((r) => r.odds), rows.map((r) => r.observedAt)],
  );
  return inserted.rows.length;
}

export interface IngestResult {
  runId: number;
  competitions: number;
  events: number;
  newSnapshots: number;
  creditsUsed: number;
  creditsRemaining: number | null;
  errors: string[];
}

/**
 * One sync: guarded by our own monthly credit cap (sum of sync_runs) and by the provider's
 * remaining count. Every run is logged in sync_runs, including failed ones.
 */
export async function ingestOdds({ db, fetchOdds, cap, now = () => new Date() }: {
  db: Db;
  fetchOdds: FetchOdds;
  cap: number;
  now?: () => Date;
}): Promise<IngestResult> {
  const [{ id: runId }] = (await db.query<{ id: number }>("insert into public.sync_runs (job) values ('ingest-odds') returning id")).rows;
  const r: IngestResult = { runId, competitions: 0, events: 0, newSnapshots: 0, creditsUsed: 0, creditsRemaining: null, errors: [] };

  try {
    const comps = (await db.query<{ id: number; external_id: string }>(
      "select id, external_id from public.competitions where is_enabled order by id",
    )).rows;
    const [{ used }] = (await db.query<{ used: number }>(
      `select coalesce(sum(credits_used), 0)::int as used from public.sync_runs
       where job = 'ingest-odds' and started_at >= date_trunc('month', now())`,
    )).rows;
    const cost = comps.length; // 1 market × 1 region per competition
    if (used + cost > cap) throw new Error(`Plafond mensuel atteint : ${used} crédits utilisés + ${cost} prévus > ${cap}`);

    for (const c of comps) {
      if (r.creditsRemaining !== null && r.creditsRemaining < 1) {
        r.errors.push("Quota du fournisseur épuisé : synchro interrompue");
        break;
      }
      try {
        const res = await fetchOdds(c.external_id);
        r.creditsUsed += res.creditsUsed;
        r.creditsRemaining = res.creditsRemaining ?? r.creditsRemaining;
        r.competitions++;
        const t = now();
        // Pre-match only: no reliable live source, so in-play prices are not stored.
        for (const e of res.events.filter((e) => Date.parse(e.commence_time) > t.getTime())) {
          r.newSnapshots += await saveEvent(db, c.id, e, t);
          r.events++;
        }
      } catch (e) {
        r.errors.push(`${c.external_id} : ${message(e)}`);
      }
    }
    await db.query("select public.prune_old_data()");
  } catch (e) {
    r.errors.push(message(e));
  } finally {
    await db.query(
      `update public.sync_runs set finished_at = now(), status = $2, credits_used = $3,
         credits_remaining = $4, items_written = $5, error = $6 where id = $1`,
      [runId, r.errors.length ? "error" : "ok", r.creditsUsed, r.creditsRemaining, r.newSnapshots, r.errors.join("\n") || null],
    );
  }
  return r;
}
