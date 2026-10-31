import { describe, expect, it } from "vitest";
import { MARKET_PICKS, type MarketKey } from "@/lib/combos/markets";
import { blend, expectedGoals, modelProbabilities, MODEL_WEIGHT, teamForm, toResults, type Result } from "@/lib/stats";

const r = (homeId: number, awayId: number, homeGoals: number, awayGoals: number, day: number): Result => ({
  utcDate: `2026-09-${String(day).padStart(2, "0")}T15:00:00Z`, homeId, awayId, homeGoals, awayGoals,
});

// Team 1 scores a lot, team 2 concedes a lot; 3 and 4 are average.
const season = [
  r(1, 3, 3, 1, 1), r(4, 1, 0, 2, 2), r(1, 4, 2, 0, 3), r(3, 1, 1, 1, 4),
  r(2, 3, 0, 2, 1), r(4, 2, 3, 1, 2), r(2, 4, 1, 2, 3), r(3, 2, 2, 0, 4),
  r(3, 4, 1, 1, 5), r(4, 3, 1, 2, 6),
];

describe("stats", () => {
  it("keeps only finished matches with a score, in date order", () => {
    const t = (id: number | null) => ({ id });
    const fd = [
      { utcDate: "2026-09-02T15:00:00Z", status: "FINISHED", homeTeam: t(1), awayTeam: t(2), score: { fullTime: { home: 1, away: 0 } } },
      { utcDate: "2026-09-01T15:00:00Z", status: "FINISHED", homeTeam: t(3), awayTeam: t(4), score: { fullTime: { home: 0, away: 0 } } },
      { utcDate: "2026-09-03T15:00:00Z", status: "IN_PLAY", homeTeam: t(1), awayTeam: t(3), score: { fullTime: { home: 1, away: 0 } } },
      { utcDate: "2026-09-04T15:00:00Z", status: "FINISHED", homeTeam: t(null), awayTeam: t(3), score: { fullTime: { home: 1, away: 0 } } },
    ];
    expect(toResults(fd).map((x) => x.homeId)).toEqual([3, 1]);
  });

  it("summarises a team's season", () => {
    const f = teamForm(season, 1)!;
    expect(f.played).toBe(4);
    expect(f.last5).toEqual(["W", "W", "W", "D"]);
    expect(f.goalsFor).toBe(2);
    expect(f.goalsAgainst).toBe(0.5);
    expect(f.cleanSheetPct).toBe(50);
    expect(f.bttsPct).toBe(50);
    expect(f.over25Pct).toBe(25);
    expect(teamForm(season, 99)).toBeNull();
  });

  it("expects more goals from the strong attack against the weak defence", () => {
    const xg = expectedGoals(season, 1, 2)!;
    const flip = expectedGoals(season, 2, 1)!;
    expect(xg.home).toBeGreaterThan(xg.away);
    expect(xg.home).toBeGreaterThan(flip.away); // home advantage on top of strength
    expect(expectedGoals(season.slice(0, 3), 1, 2)).toBeNull(); // too few games
  });

  it("gives coherent probabilities for every market pick", () => {
    const p = modelProbabilities({ home: 1.6, away: 1.1 });
    for (const [m, picks] of Object.entries(MARKET_PICKS)) {
      const sum = picks.reduce((s, k) => s + p[m as MarketKey][k], 0);
      expect(sum).toBeCloseTo(m === "double_chance" ? 2 : 1, 9);
    }
    expect(p.h2h.home).toBeGreaterThan(p.h2h.away);
    // Poisson(2.7 total goals): P(≤ 2) = e^-2.7 (1 + 2.7 + 2.7²/2)
    expect(p["totals_2.5"].under).toBeCloseTo(Math.exp(-2.7) * (1 + 2.7 + 2.7 ** 2 / 2), 5); // grid cut at 10 goals: ~1e-6
  });

  it("blends the model in at a fixed weight, or leaves the market alone", () => {
    expect(blend(0.5, 0.7)).toBeCloseTo(0.5 + MODEL_WEIGHT * 0.2, 12);
    expect(blend(0.5, undefined)).toBe(0.5);
  });
});
