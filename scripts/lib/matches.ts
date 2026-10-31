import { median } from "../../src/lib/odds/calc.ts";
import { OUTCOMES, type Match, type OddsPoint, type Outcome } from "../../src/lib/types.ts";
import type { Db } from "./db.ts";

export type LoadedMatch = Match & { bookmakerCount: number };

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();

/**
 * Upcoming matches in the same shape the UI and the generator use: the reference bookmaker's
 * history per outcome, plus the median of every bookmaker's latest price.
 */
export async function loadMatches(db: Db, now: Date): Promise<LoadedMatch[]> {
  const ms = (
    await db.query<Record<string, unknown>>(
      `select m.id::text as id, m.kickoff_at, m.status, m.last_synced_at, m.reference_bookmaker, m.reference_seen_at,
         c.id::text as c_id, c.name as c_name, c.country as c_country,
         m.football_data_id, h.id::text as h_id, h.name as h_name, h.short_name as h_short, h.external_id as h_fd, h.crest_url as h_crest,
         a.id::text as a_id, a.name as a_name, a.short_name as a_short, a.external_id as a_fd, a.crest_url as a_crest
       from public.matches m
       join public.competitions c on c.id = m.competition_id and c.is_enabled
       join public.teams h on h.id = m.home_team_id
       join public.teams a on a.id = m.away_team_id
       where m.status = 'scheduled' and m.kickoff_at > $1 and m.reference_bookmaker is not null
       order by m.kickoff_at, m.id`,
      [now.toISOString()],
    )
  ).rows;
  if (ms.length === 0) return [];

  const snaps = (
    await db.query<{ match_id: string; bookmaker: string; selection_key: Outcome; odds: number; observed_at: unknown }>(
      `select match_id::text as match_id, bookmaker, selection_key, odds_value::float8 as odds, observed_at
       from public.odds_snapshots
       where market_key = 'h2h' and bookmaker not like 'af:%' and match_id = any($1::bigint[])
       order by observed_at, id`,
      [ms.map((m) => m.id)],
    )
  ).rows;

  return ms.map((m) => {
    const own = snaps.filter((s) => s.match_id === m.id);
    const h2h = { home: [], draw: [], away: [] } as Record<Outcome, OddsPoint[]>;
    const latest = new Map<string, number>(); // `${bookmaker}|${outcome}` → last price (rows are chronological)
    for (const s of own) {
      latest.set(`${s.bookmaker}|${s.selection_key}`, s.odds);
      if (s.bookmaker === m.reference_bookmaker && s.selection_key in h2h)
        h2h[s.selection_key].push({ observedAt: iso(s.observed_at), odds: s.odds });
    }
    const consensus: Partial<Record<Outcome, number>> = {};
    for (const o of OUTCOMES) {
      const med = median([...latest].filter(([k]) => k.endsWith(`|${o}`)).map(([, v]) => v));
      if (med !== null) consensus[o] = med;
    }
    return {
      id: String(m.id),
      competition: { id: String(m.c_id), name: String(m.c_name), country: String(m.c_country) },
      home: { id: String(m.h_id), name: String(m.h_name), shortName: String(m.h_short), fdId: m.h_fd as string | null, crest: m.h_crest as string | null },
      away: { id: String(m.a_id), name: String(m.a_name), shortName: String(m.a_short), fdId: m.a_fd as string | null, crest: m.a_crest as string | null },
      footballDataId: m.football_data_id as string | null,
      kickoffAt: iso(m.kickoff_at),
      status: "scheduled",
      lastSyncedAt: m.last_synced_at ? iso(m.last_synced_at) : now.toISOString(),
      bookmaker: String(m.reference_bookmaker),
      h2h,
      confirmedAt: m.reference_seen_at ? iso(m.reference_seen_at) : null,
      consensus,
      bookmakerCount: new Set(own.map((s) => s.bookmaker)).size,
    };
  });
}
