import { MARKET_PICKS, marketProbabilities, pickLabel, type MarketKey } from "../../src/lib/combos/markets.ts";
import type { Selection } from "../../src/lib/combos/tiers.ts";
import { matchLabel } from "../../src/lib/formatting.ts";
import { blend, expectedGoals, modelProbabilities, type Result } from "../../src/lib/stats.ts";
import type { Db } from "./db.ts";

/**
 * Every complete market of the day's scheduled matches, priced by the match's markets bookmaker.
 * With `seasons` (finished results per football-data competition code), each probability is blended
 * with the Poisson model of the two teams' season; matches without enough data keep the market's.
 */
export async function loadSelections(db: Db, day: string, seasons = new Map<string, Result[]>()): Promise<Selection[]> {
  const matches = (
    await db.query<{ id: string; kickoff: string; home_id: string; home: string; away_id: string; away: string; bookmaker: string; code: string | null; home_fd: string | null; away_fd: string | null }>(
      `select m.id::text as id, m.kickoff_at as kickoff, h.id::text as home_id, h.name as home,
         a.id::text as away_id, a.name as away, m.markets_bookmaker as bookmaker,
         c.football_data_code as code, h.external_id as home_fd, a.external_id as away_fd
       from public.matches m
       join public.competitions c on c.id = m.competition_id
       join public.teams h on h.id = m.home_team_id
       join public.teams a on a.id = m.away_team_id
       where m.status = 'scheduled' and m.markets_bookmaker is not null
         and (m.kickoff_at at time zone 'UTC')::date = $1::date`,
      [day],
    )
  ).rows;
  if (!matches.length) return [];

  const snaps = (
    await db.query<{ match_id: string; market_key: string; selection_key: string; odds: number; observed_at: string }>(
      `select s.match_id::text as match_id, s.market_key, s.selection_key, s.odds_value::float8 as odds, s.observed_at
       from public.odds_snapshots s join public.matches m on m.id = s.match_id
       where s.match_id = any($1::bigint[]) and s.bookmaker = m.markets_bookmaker
       order by s.observed_at, s.id`,
      [matches.map((m) => m.id)],
    )
  ).rows;
  // Ordered by time: the first row seen per pick is its first price, the last one its current price.
  const history = new Map<string, { first: number; last: number; observedAt: string }>();
  for (const s of snaps) {
    const key = `${s.match_id}|${s.market_key}|${s.selection_key}`;
    const h = history.get(key);
    if (h) Object.assign(h, { last: s.odds, observedAt: s.observed_at });
    else history.set(key, { first: s.odds, last: s.odds, observedAt: s.observed_at });
  }

  const out: Selection[] = [];
  for (const m of matches) {
    const season = m.code ? seasons.get(m.code) : undefined;
    const xg = season && m.home_fd && m.away_fd ? expectedGoals(season, Number(m.home_fd), Number(m.away_fd)) : null;
    const model = xg && modelProbabilities(xg);
    for (const market of Object.keys(MARKET_PICKS) as MarketKey[]) {
      const rows = MARKET_PICKS[market].map((pick) => history.get(`${m.id}|${market}|${pick}`));
      if (rows.some((r) => !r)) continue;
      const probs = marketProbabilities(market, Object.fromEntries(MARKET_PICKS[market].map((p, i) => [p, rows[i]!.last])));
      if (!probs) continue;
      MARKET_PICKS[market].forEach((pick, i) => {
        const r = rows[i]!;
        const modelProbability = model?.[market][pick];
        out.push({
          matchId: m.id,
          teamIds: [m.home_id, m.away_id],
          kickoffAt: new Date(m.kickoff).toISOString(),
          market,
          pick,
          odds: r.last,
          probability: blend(probs[pick], modelProbability),
          marketProbability: probs[pick],
          modelProbability,
          observedAt: new Date(r.observedAt).toISOString(),
          dropped: r.last < r.first,
          label: pickLabel(market, pick, m.home, m.away),
          matchLabel: matchLabel({ home: { id: m.home_id, name: m.home, shortName: m.home }, away: { id: m.away_id, name: m.away, shortName: m.away } }),
        });
      });
    }
  }
  return out;
}
