import { describe, expect, it } from "vitest";
import {
  dropPercent,
  impliedProbability,
  marketMargin,
  normalizedProbabilities,
  relativeChange,
  selectionSignal,
  totalOdds,
} from "@/lib/odds/calc";

const now = new Date("2026-10-24T12:00:00Z");
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();

describe("odds maths", () => {
  it("computes relative change and drop with opposite signs", () => {
    expect(relativeChange(2, 1.8)).toBeCloseTo(-10);
    expect(dropPercent(2, 1.8)).toBeCloseTo(10);
    expect(relativeChange(2, 2.5)).toBeCloseTo(25);
  });

  it("rejects invalid odds instead of returning numbers", () => {
    expect(relativeChange(0, 2)).toBeNull();
    expect(dropPercent(2, NaN)).toBeNull();
    expect(impliedProbability(1)).toBeNull();
    expect(totalOdds([])).toBeNull();
    expect(totalOdds([2, 0.5])).toBeNull();
  });

  it("computes implied probability, margin and normalised market", () => {
    expect(impliedProbability(4)).toBe(0.25);
    const market = [1.85, 3.7, 4.2];
    expect(marketMargin(market)!).toBeCloseTo(0.0485, 3);
    const p = normalizedProbabilities(market)!;
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(p[0]).toBeLessThan(1 / 1.85);
  });

  it("multiplies odds for the theoretical total", () => {
    expect(totalOdds([1.5, 2, 3])).toBeCloseTo(9);
  });
});

describe("selectionSignal", () => {
  it("needs two observations to report a movement", () => {
    const s = selectionSignal([{ observedAt: at(1), odds: 2 }], now);
    expect(s.observations).toBe(1);
    expect(s.dropPct).toBeNull();
    expect(s.stale).toBe(false);
  });

  it("flags stale data", () => {
    const s = selectionSignal([{ observedAt: at(30), odds: 2 }, { observedAt: at(13), odds: 1.8 }], now);
    expect(s.stale).toBe(true);
    expect(s.dropPct).toBeCloseTo(10);
  });

  it("treats an empty history as stale with no values", () => {
    const s = selectionSignal([], now);
    expect(s).toMatchObject({ first: null, current: null, stale: true, changePct: null });
  });

  it("ignores invalid points", () => {
    const s = selectionSignal([{ observedAt: at(5), odds: 0 }, { observedAt: at(2), odds: 2 }], now);
    expect(s.observations).toBe(1);
  });
});
