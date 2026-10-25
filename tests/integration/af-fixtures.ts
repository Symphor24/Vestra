import type { AfFixture, AfOdds, ApiFootball } from "../../scripts/lib/api-football";
import { after, T0 } from "./fixtures";

/** Tomorrow's fixtures for the seeded `Home i` / `Away i` matches (same kickoffs as seedTwoSyncs). */
export const afFixtures = (): AfFixture[] =>
  [1, 2, 3, 4, 5].map((i) => ({ id: 100 + i, date: after(48 + i).toISOString(), leagueId: 39, home: `Home ${i}`, away: `Away ${i}`, status: "NS" }));

const bet = (id: number, values: [string, string][]) => ({ id, values: values.map(([value, odd]) => ({ value, odd })) });

export const BETS = {
  1: bet(1, [["Home", "1.36"], ["Draw", "5.10"], ["Away", "7.50"]]),
  12: bet(12, [["Home/Draw", "1.12"], ["Home/Away", "1.14"], ["Draw/Away", "2.75"]]),
  5: bet(5, [["Over 1.5", "1.20"], ["Under 1.5", "4.30"], ["Over 2.5", "1.80"], ["Under 2.5", "2.00"], ["Over 3.5", "2.90"], ["Under 3.5", "1.40"], ["Over 0.5", "1.05"]]),
  8: bet(8, [["Yes", "1.57"], ["No", "2.25"]]),
};

export const book = (name: string, bets: AfOdds["bookmakers"][number]["bets"] = Object.values(BETS)) => ({ name, bets });

export const afOdds = (fixtureId: number, bookmakers = [book("Bet365")]): AfOdds => ({
  fixtureId,
  update: after(-0.5, T0).toISOString(),
  bookmakers,
});

/** Fake client; `calls` counts the requests it would have cost. */
export function fakeAf(opts: { fixtures?: AfFixture[]; odds?: (id: number) => AfOdds | null } = {}) {
  const calls = { fixtures: 0, odds: 0 };
  const af: ApiFootball = {
    fixtures: async () => (calls.fixtures++, opts.fixtures ?? afFixtures()),
    odds: async (id) => (calls.odds++, opts.odds ? opts.odds(id) : afOdds(id)),
  };
  return { af, calls };
}
