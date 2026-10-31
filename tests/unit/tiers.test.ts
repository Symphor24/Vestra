import { describe, expect, it } from "vitest";
import type { MarketKey } from "@/lib/combos/markets";
import { buildTier, generateDay, MAX_LEGS, tierBand, TIERS, type Selection, type Tier } from "@/lib/combos/tiers";

function sel(
  matchId: string,
  market: MarketKey,
  pick: string,
  odds: number,
  probability: number,
  teams: [string, string] = [`${matchId}-h`, `${matchId}-a`],
  dropped = false,
): Selection {
  return {
    matchId,
    teamIds: teams,
    kickoffAt: "2026-10-26T15:00:00Z",
    market,
    pick,
    odds,
    probability,
    observedAt: "2026-10-25T13:15:00Z",
    dropped,
    label: `${market} ${pick}`,
    matchLabel: matchId,
  };
}

// Fixed-seed generator so the "random" cases are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const MARKETS: [MarketKey, string][] = [
  ["h2h", "home"], ["h2h", "draw"], ["h2h", "away"], ["double_chance", "1X"], ["double_chance", "12"],
  ["double_chance", "X2"], ["totals_1.5", "over"], ["totals_1.5", "under"], ["totals_2.5", "over"],
  ["totals_2.5", "under"], ["totals_3.5", "over"], ["totals_3.5", "under"], ["btts", "yes"], ["btts", "no"],
  ["h2h", "home-alt"],
];

function randomDay(seed: number, matches: number, perMatch: number, shareTeam = false): Selection[] {
  const r = rng(seed);
  const out: Selection[] = [];
  for (let m = 0; m < matches; m++) {
    const id = `m${String(m).padStart(2, "0")}`;
    // Optionally make the 3rd and last matches share a team with the first one.
    const teams: [string, string] =
      shareTeam && m === matches - 1 ? ["m00-h", `${id}-a`] : shareTeam && m === 2 ? [`${id}-h`, "m00-h"] : [`${id}-h`, `${id}-a`];
    for (let s = 0; s < perMatch; s++) {
      const odds = Math.round((1.08 + r() * 6) * 100) / 100;
      const [market, pick] = MARKETS[s];
      out.push(sel(id, market, pick, odds, (1 / odds) * (0.88 + r() * 0.1), teams));
    }
  }
  return out;
}

const product = (legs: Selection[], k: "odds" | "probability") => legs.reduce((p, l) => p * l[k], 1);
// Search weight: probability, cut by 2.2 / odds above 2.20.
const score = (legs: Selection[]) => legs.reduce((p, l) => p * l.probability * Math.min(1, 2.2 / l.odds), 1);

// Exhaustive reference: same constraints and tie rule as the spec, written independently.
function bruteForce(selections: Selection[], tier: Tier): number | null {
  const [lo, hi] = tierBand(tier);
  const byMatch = [...Map.groupBy(selections, (s) => s.matchId).values()];
  const best = new Map<number, number>(); // legs → best score
  const walk = (i: number, legs: Selection[]) => {
    if (i === byMatch.length) {
      const odds = product(legs, "odds");
      if (legs.length >= 2 && odds >= lo && odds <= hi) {
        const p = score(legs);
        if (p > (best.get(legs.length) ?? -1)) best.set(legs.length, p);
      }
      return;
    }
    walk(i + 1, legs);
    for (const s of byMatch[i]) {
      if (legs.some((l) => l.teamIds.some((t) => s.teamIds.includes(t)))) continue;
      walk(i + 1, [...legs, s]);
    }
  };
  walk(0, []);
  if (best.size === 0) return null;
  const max = Math.max(...best.values());
  const legs = Math.min(...[...best].filter(([, p]) => p >= max * 0.99).map(([n]) => n));
  return best.get(legs)!;
}

describe("tier generator", () => {
  const day = randomDay(42, 12, 8, true);

  it("respects the band", () => {
    const tickets = generateDay(day);
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      const [lo, hi] = tierBand(t.tier);
      expect(t.totalOdds).toBeGreaterThanOrEqual(lo);
      expect(t.totalOdds).toBeLessThanOrEqual(hi);
      expect(t.totalOdds).toBeCloseTo(product(t.legs, "odds"), 9);
      expect(t.probability).toBeCloseTo(product(t.legs, "probability"), 12);
      expect(t.legs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("one selection per match and no shared team", () => {
    for (const t of generateDay(day)) {
      for (let i = 0; i < t.legs.length; i++) {
        for (let j = i + 1; j < t.legs.length; j++) {
          expect(t.legs[i].matchId).not.toBe(t.legs[j].matchId);
          expect(t.legs[i].teamIds.filter((x) => t.legs[j].teamIds.includes(x))).toEqual([]);
        }
      }
    }
  });

  it("leaves an unreachable tier empty", () => {
    const small = ["a", "b", "c"].map((m) => sel(m, "h2h", "home", 1.3, 0.72));
    expect(buildTier(small, 100)).toBeNull();
    const tiers = generateDay(small).map((t) => t.tier);
    expect(tiers).toContain(2);
    expect(tiers).not.toContain(100);
  });

  it("finds the optimum on small cases", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const shareTeam = seed % 2 === 0;
      const small = randomDay(seed, 6, 4, shareTeam);
      for (const tier of TIERS) {
        const expected = bruteForce(small, tier);
        const legs = buildTier(small, tier);
        if (expected === null) expect(legs).toBeNull();
        else expect(score(legs!)).toBeCloseTo(expected, 9);
      }
    }
  });

  it("prefers fewer legs at equal probability", () => {
    const s = [
      sel("a", "h2h", "home", 2.2, 0.45),
      sel("b", "h2h", "home", 2.2, 0.45), // a+b: 4.84, 0.2025
      sel("c", "h2h", "home", 1.7, 0.5887),
      sel("d", "h2h", "home", 1.7, 0.5887),
      sel("e", "h2h", "home", 1.7, 0.5887), // c+d+e: 4.913, 0.20403 (less than 1 % above)
    ];
    expect(buildTier(s, 5)!.map((l) => l.matchId)).toEqual(["a", "b"]);
  });

  it("reaches big tiers with many solid legs rather than a few long shots", () => {
    // Fair-ish markets (6 % margin): per match a 2.00 pick and a 9.50 outsider.
    const s = Array.from({ length: 14 }, (_, i) => [
      sel(`m${String(i).padStart(2, "0")}`, "double_chance", "1X", 2, 1 / 2 / 1.06),
      sel(`m${String(i).padStart(2, "0")}`, "h2h", "away", 9.5, 1 / 9.5 / 1.06),
    ]).flat();
    const legs = buildTier(s, 1000)!;
    expect(legs.length).toBe(10); // 2^10 = 1024, where four 9.50 legs (8 145) or three (857) were as close
    expect(legs.every((l) => l.odds === 2)).toBe(true);
  });

  it("never exceeds the leg cap", () => {
    const s = Array.from({ length: 20 }, (_, i) => sel(`m${String(i).padStart(2, "0")}`, "h2h", "home", 1.5, 0.63));
    expect(buildTier(s, 5000)).toBeNull(); // 1.5^15 ≈ 438: 21 legs would be needed
    expect(buildTier(s, 500)!.length).toBeLessThanOrEqual(MAX_LEGS);
  });

  it("is deterministic", () => {
    const r = rng(9);
    const shuffled = [...day].sort(() => r() - 0.5);
    expect(generateDay(shuffled)).toEqual(generateDay(day));
  });

  it("features the most probable small tiers with the drop bonus", () => {
    const build = (dropped: boolean) => [
      sel("m1", "h2h", "home", 1.4, Math.sqrt(0.4)),
      sel("m2", "h2h", "home", 1.4, Math.sqrt(0.4)), // tier 2: 0.40
      sel("m3", "btts", "yes", 2.2, Math.sqrt(0.37), undefined, dropped),
      sel("m4", "btts", "yes", 2.2, Math.sqrt(0.37), undefined, dropped), // tier 5: 0.37
      sel("m5", "totals_2.5", "over", 3.2, Math.sqrt(0.31)),
      sel("m6", "totals_2.5", "over", 3.2, Math.sqrt(0.31)), // tier 10: 0.31
    ];
    const featured = (s: Selection[]) => generateDay(s).filter((t) => t.featured).map((t) => t.tier).sort((a, b) => a - b);
    // No drop: 0.40, 0.37, then 0.31 ≥ 0.8 × 0.37 → three featured.
    expect(featured(build(false))).toEqual([2, 5, 10]);
    // Drops lift tier 5 to 0.407, ahead of tier 2 (0.40): the 3rd now needs 0.32 and tier 10 drops out.
    expect(featured(build(true))).toEqual([2, 5]);
  });

  it("runs fast", () => {
    const big = randomDay(1, 60, 15);
    // CPU time of this test process, not wall time: the suite runs files in parallel on a shared machine.
    const start = process.cpuUsage();
    const tickets = generateDay(big);
    const { user, system } = process.cpuUsage(start);
    expect((user + system) / 1000).toBeLessThan(1000);
    expect(tickets.length).toBe(TIERS.length);
  });
});
