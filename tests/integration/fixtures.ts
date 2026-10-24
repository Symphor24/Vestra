import type { PGlite } from "@electric-sql/pglite";
import { ingestOdds } from "../../scripts/lib/ingest";
import type { FetchOdds, OddsEvent } from "../../scripts/lib/odds-api";

// Shared scenario: 5 Premier League matches whose home price shortens from 2.00 to 1.75 between T0 and T1.
export const T0 = new Date("2026-10-24T08:00:00Z");
export const after = (h: number, base = T0) => new Date(base.getTime() + h * 3_600_000);

export type P = [number, number, number];
/** Reference (pinnacle) prices plus two other books; `others` defaults to the same prices. */
export function ev(i: number, ref: P, updated: Date, others: P = ref): OddsEvent {
  const home = `Home ${i}`;
  const away = `Away ${i}`;
  const book = (key: string, [h, d, a]: P) => ({
    key,
    title: key,
    last_update: updated.toISOString(),
    markets: [{ key: "h2h", last_update: updated.toISOString(), outcomes: [{ name: home, price: h }, { name: "Draw", price: d }, { name: away, price: a }] }],
  });
  return {
    id: `evt-${i}`,
    sport_key: "soccer_epl",
    commence_time: after(48 + i).toISOString(),
    home_team: home,
    away_team: away,
    bookmakers: [book("pinnacle", ref), book("unibet_eu", others), book("williamhill", others)],
  };
}

export const ingestAt = (db: PGlite, when: Date, events: OddsEvent[]) => {
  const fetchOdds: FetchOdds = async (k) => ({ events: k === "soccer_epl" ? events : [], creditsUsed: 1, creditsRemaining: 300 });
  return ingestOdds({ db, fetchOdds, cap: 470, now: () => when });
};

export const OPEN: P = [2.0, 3.4, 3.8];
export const SHORT: P = [1.75, 3.6, 4.6]; // home −12.5 %
export const five = (p: P, at: Date) => [1, 2, 3, 4, 5].map((i) => ev(i, p, at));
export const T1 = after(6);

/** Two syncs: T0 at opening prices, T1 after the move. */
export async function seedTwoSyncs(db: PGlite) {
  await ingestAt(db, T0, five(OPEN, after(-1)));
  await ingestAt(db, T1, five(SHORT, after(-0.5, T1)));
}
