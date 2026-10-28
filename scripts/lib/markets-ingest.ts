import { MARKET_PICKS, type MarketKey } from "../../src/lib/combos/markets.ts";
import { AF_LEAGUES, AfApiError, type AfFixture, type AfOdds, type ApiFootball } from "./api-football.ts";
import type { Db } from "./db.ts";
import type { FdMatch } from "./football-data.ts";
import { HttpError } from "./http.ts";
import { findFixture, type Pending } from "./results.ts";

interface MarketRow { market: MarketKey; pick: string; odds: number }

const H2H: Record<string, string> = { Home: "home", Draw: "draw", Away: "away" };
const DOUBLE: Record<string, string> = { "Home/Draw": "1X", "Home/Away": "12", "Draw/Away": "X2" };
const YES_NO: Record<string, string> = { Yes: "yes", No: "no" };
// Namespaced in the DB: The Odds API also stores bookmakers (e.g. pinnacle) and the two must never mix.
const AF_PREFIX = "af:";
const BET_IDS = [1, 5, 8, 12];
const WINDOW_HOURS_UTC = [7, 8, 13, 14];

/** Our rows for one bookmaker; a market is kept only when every one of its picks is priced. */
export function marketRows(o: AfOdds, bookmaker: string): MarketRow[] {
  const book = o.bookmakers.find((b) => AF_PREFIX + b.name.toLowerCase() === bookmaker);
  if (!book) return [];
  const found = new Map<MarketKey, Record<string, number>>();
  const add = (market: MarketKey, pick: string | undefined, odd: string) => {
    const odds = Number(odd);
    if (pick && Number.isFinite(odds) && odds > 1) found.set(market, { ...found.get(market), [pick]: odds });
  };
  for (const bet of book.bets) {
    for (const { value, odd } of bet.values) {
      if (bet.id === 1) add("h2h", H2H[value], odd);
      else if (bet.id === 12) add("double_chance", DOUBLE[value], odd);
      else if (bet.id === 8) add("btts", YES_NO[value], odd);
      else if (bet.id === 5) {
        const m = /^(Over|Under) (1\.5|2\.5|3\.5)$/.exec(value);
        if (m) add(`totals_${m[2]}` as MarketKey, m[1].toLowerCase(), odd);
      }
    }
  }
  return [...found].flatMap(([market, prices]) =>
    MARKET_PICKS[market].every((p) => prices[p] !== undefined) ? MARKET_PICKS[market].map((pick) => ({ market, pick, odds: prices[pick] })) : [],
  );
}

/** bet365 when it prices all four bets, else the book with the most of them (ties: alphabetical). */
export function pickMarketsBookmaker(o: AfOdds): string | null {
  const scored = o.bookmakers
    .map((b) => ({ name: b.name.toLowerCase(), n: BET_IDS.filter((id) => b.bets.some((x) => x.id === id)).length }))
    .filter((b) => b.n > 0);
  const best = scored.some((b) => b.name === "bet365" && b.n === BET_IDS.length)
    ? "bet365"
    : scored.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))[0]?.name;
  return best ? AF_PREFIX + best : null;
}

export interface MarketsOutcome {
  fixtures: number;
  linked: number;
  oddsFetched: number;
  snapshots: number;
  requests: number;
  unmatched: string[];
  errors: string[];
}

const toFd = (f: AfFixture): FdMatch => ({
  id: f.id,
  utcDate: new Date(f.date).toISOString(),
  status: f.status,
  homeTeam: { id: null, name: f.home, shortName: null },
  awayTeam: { id: null, name: f.away, shortName: null },
  score: { fullTime: { home: null, away: null } },
});

/**
 * Tomorrow's multi-market odds, in two daily windows. Each call costs one of the free plan's
 * 100 daily requests; `budget` keeps a margin and counts what earlier runs of the day used.
 */
export async function ingestMarkets(db: Db, af: ApiFootball, now: Date, budget = 90): Promise<MarketsOutcome> {
  const out: MarketsOutcome = { fixtures: 0, linked: 0, oddsFetched: 0, snapshots: 0, requests: 0, unmatched: [], errors: [] };
  if (!WINDOW_HOURS_UTC.includes(now.getUTCHours())) return out;

  const [{ used }] = (
    await db.query<{ used: number }>(
      `select coalesce(sum(credits_used), 0)::int as used from public.sync_runs
       where job = 'ingest-markets' and started_at >= date_trunc('day', $1::timestamptz at time zone 'UTC') at time zone 'UTC'`,
      [now.toISOString()],
    )
  ).rows;
  const left = budget - used;
  if (left < 1) return out;

  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  let fixtures: AfFixture[];
  out.requests++;
  try {
    fixtures = await af.fixtures(tomorrow);
  } catch (e) {
    out.errors.push((e as Error).message);
    return out;
  }
  fixtures = fixtures.filter((f) => AF_LEAGUES[f.leagueId] && f.status === "NS");
  out.fixtures = fixtures.length;

  const rows = (
    await db.query<Record<string, string | Date | null>>(
      `select m.id::text as id, m.kickoff_at, c.football_data_code as code, m.markets_bookmaker,
         h.id::text as h_id, h.name as h_name, a.id::text as a_id, a.name as a_name
       from public.matches m
       join public.competitions c on c.id = m.competition_id
       join public.teams h on h.id = m.home_team_id
       join public.teams a on a.id = m.away_team_id
       where m.status = 'scheduled' and c.football_data_code is not null
         and (m.kickoff_at at time zone 'UTC')::date = $1::date
       order by m.kickoff_at`,
      [tomorrow],
    )
  ).rows;

  const linked: { matchId: string; fixtureId: number; bookmaker: string | null; label: string }[] = [];
  for (const r of rows) {
    const p: Pending = {
      id: String(r.id),
      kickoff: new Date(r.kickoff_at as string),
      code: String(r.code),
      // external_id stays null: the football-data ids we learned mean nothing to API-Football.
      home: { id: String(r.h_id), name: String(r.h_name), external_id: null },
      away: { id: String(r.a_id), name: String(r.a_name), external_id: null },
    };
    const label = `${p.home.name} – ${p.away.name}`;
    const f = findFixture(p, fixtures.filter((x) => AF_LEAGUES[x.leagueId] === p.code).map(toFd));
    if (!f) {
      out.unmatched.push(label);
      continue;
    }
    try {
      await db.query("update public.matches set api_football_id = $2 where id = $1", [p.id, f.id]);
      linked.push({ matchId: p.id, fixtureId: f.id, bookmaker: r.markets_bookmaker as string | null, label });
    } catch (e) {
      out.errors.push(`${label} : ${(e as Error).message}`);
    }
  }
  out.linked = linked.length;

  for (const m of linked) { // already ordered by kickoff
    if (out.requests >= left) break;
    out.requests++;
    try {
      const odds = await af.odds(m.fixtureId);
      if (!odds) continue;
      out.oddsFetched++;
      const bookmaker = m.bookmaker ?? pickMarketsBookmaker(odds);
      if (!bookmaker) continue;
      if (!m.bookmaker) await db.query("update public.matches set markets_bookmaker = $2 where id = $1", [m.matchId, bookmaker]);
      const prices = marketRows(odds, bookmaker);
      if (prices.length === 0) continue;
      const inserted = await db.query(
        `insert into public.odds_snapshots (match_id, bookmaker, market_key, selection_key, odds_value, observed_at)
         select $1, $2, m, p, o, $3 from unnest($4::text[], $5::text[], $6::numeric[]) as x(m, p, o)
         on conflict do nothing
         returning 1`,
        [m.matchId, bookmaker, odds.update, prices.map((x) => x.market), prices.map((x) => x.pick), prices.map((x) => x.odds)],
      );
      out.snapshots += inserted.rows.length;
    } catch (e) {
      out.errors.push(`${m.label} : ${(e as Error).message}`);
      if (e instanceof AfApiError || (e as HttpError).status === 429) break; // the next calls would fail too (plan error, quota)
    }
  }
  return out;
}
