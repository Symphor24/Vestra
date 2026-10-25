import { describe, expect, it } from "vitest";
import { marketProbabilities, pickLabel } from "@/lib/combos/markets";

describe("marketProbabilities", () => {
  it("normalise le 1N2 à 1", () => {
    expect(marketProbabilities("h2h", { home: 2, draw: 4, away: 4 })).toEqual({ home: 0.5, draw: 0.25, away: 0.25 });
  });
  it("normalise la double chance à 2 (1X = P(1)+P(N))", () => {
    const p = marketProbabilities("double_chance", { "1X": 1 / 0.75, "12": 1 / 0.75, X2: 1 / 0.5 })!;
    expect(p["1X"]).toBeCloseTo(0.75, 6);
    expect(p["12"]).toBeCloseTo(0.75, 6);
    expect(p.X2).toBeCloseTo(0.5, 6);
    expect(p["1X"] + p["12"] + p.X2).toBeCloseTo(2, 6);
  });
  it("retire la marge", () => {
    expect(marketProbabilities("totals_2.5", { over: 1.8, under: 1.8 })).toEqual({ over: 0.5, under: 0.5 });
  });
  it("refuse un marché incomplet ou une cote invalide", () => {
    expect(marketProbabilities("totals_2.5", { over: 1.36 })).toBeNull();
    expect(marketProbabilities("btts", { yes: 1, no: 2 })).toBeNull();
  });
});

describe("pickLabel", () => {
  it.each([
    ["totals_2.5", "over", "Plus de 2,5 buts"],
    ["totals_1.5", "under", "Moins de 1,5 buts"],
    ["btts", "yes", "Les deux équipes marquent : oui"],
    ["btts", "no", "Les deux équipes marquent : non"],
    ["double_chance", "1X", "Double chance Lyon ou nul"],
    ["double_chance", "12", "Double chance Lyon ou PSG"],
    ["double_chance", "X2", "Double chance nul ou PSG"],
    ["h2h", "home", "Victoire Lyon"],
    ["h2h", "draw", "Match nul"],
    ["h2h", "away", "Victoire PSG"],
  ] as const)("%s %s", (m, p, label) => {
    expect(pickLabel(m, p, "Lyon", "PSG")).toBe(label);
  });
});
