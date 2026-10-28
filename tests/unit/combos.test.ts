import { describe, expect, it } from "vitest";
import { eligibleCandidates } from "@/lib/combos/generate";
import { reviewSlip, ticketText } from "@/lib/combos/slip";
import { buildDemoMatches } from "@/lib/demo/data";
import type { Leg, Match } from "@/lib/types";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const now = new Date(NOW);
const matches = buildDemoMatches(NOW);
const byId = new Map(matches.map((m) => [m.id, m]));

describe("eligibleCandidates", () => {
  const c = eligibleCandidates(matches, now);

  it("excludes stale, finished, single-observation and weak-signal matches", () => {
    const ids = c.map((x) => x.match.id);
    expect(ids).not.toContain("mci-tot"); // stale
    expect(ids).not.toContain("nap-mil"); // finished
    expect(ids).not.toContain("asm-ogcn"); // one observation
    expect(ids).not.toContain("juv-rom"); // < 10 % drop
  });

  it("keeps at most one selection per match, sorted by drop", () => {
    expect(new Set(c.map((x) => x.match.id)).size).toBe(c.length);
    for (let i = 1; i < c.length; i++) expect(c[i - 1].dropPct).toBeGreaterThanOrEqual(c[i].dropPct);
  });

  it("excludes matches kicking off within 30 minutes", () => {
    const soon = buildDemoMatches(NOW).map((m) => ({ ...m, kickoffAt: new Date(NOW + 10 * 60_000).toISOString() }));
    expect(eligibleCandidates(soon, now)).toHaveLength(0);
  });
});

describe("reviewSlip", () => {
  const leg = (matchId: string, outcome: Leg["outcome"], odds: number): Leg => ({
    matchId, market: "h2h", outcome, odds, observedAt: now.toISOString(), label: outcome, matchLabel: matchId,
  });

  it("flags two outcomes of the same match as incompatible and refuses a probability", () => {
    const r = reviewSlip([leg("ars-che", "home", 1.85), leg("ars-che", "draw", 3.7)], byId, now);
    expect(r.conflicts.has("ars-che")).toBe(true);
    expect(r.probabilityIfIndependent).toBeNull();
  });

  it("recomputes the total and reports price moves and stale legs", () => {
    const r = reviewSlip([leg("ars-che", "home", 2.0), leg("mci-tot", "home", 1.28)], byId, now);
    expect(r.total).toBeCloseTo(2.56);
    expect(r.moved.get(0)).toBe(1.85);
    expect(r.stale.has(1)).toBe(true);
  });

  it("marks unknown or finished matches as stale", () => {
    const r = reviewSlip([leg("nope", "home", 2), leg("nap-mil", "home", 2.1)], byId, now);
    expect([...r.stale]).toEqual([0, 1]);
  });

  it("produces a readable ticket text", () => {
    expect(ticketText([leg("ars-che", "home", 1.85)], 1.85)).toContain("@ 1.85");
  });
});

describe("quality filters (§11.4)", () => {
  const ars = byId.get("ars-che")!; // home: 2.10 → 1.85, −11.9 %

  it("excludes a reference price far from the market median", () => {
    const off: Match = { ...ars, consensus: { home: 2.1 } }; // 1.85 is 11.9 % below the median
    const ok: Match = { ...ars, consensus: { home: 1.9 } };
    expect(eligibleCandidates([off], now)).toHaveLength(0);
    expect(eligibleCandidates([ok], now)).toHaveLength(1);
  });

  it("excludes implausibly large drops", () => {
    const crash: Match = { ...ars, h2h: { ...ars.h2h, home: [{ ...ars.h2h.home[0], odds: 4 }, ars.h2h.home.at(-1)!] } };
    expect(eligibleCandidates([crash], now)).toHaveLength(0);
  });

  it("uses the last confirmation for freshness", () => {
    const age = (p: { observedAt: string; odds: number }) => ({ ...p, observedAt: new Date(Date.parse(p.observedAt) - 20 * 3_600_000).toISOString() });
    const stale: Match = { ...ars, h2h: { home: ars.h2h.home.map(age), draw: ars.h2h.draw.map(age), away: ars.h2h.away.map(age) } };
    expect(eligibleCandidates([stale], now)).toHaveLength(0);
    expect(eligibleCandidates([{ ...stale, confirmedAt: now.toISOString() }], now)).toHaveLength(1);
  });

  it("flags shared-team legs in a user slip and withholds the probability", () => {
    const ars2: Match = { ...ars, id: "ars-2", away: { id: "x", name: "X", shortName: "X" } };
    const map = new Map([...byId, ["ars-2", ars2]]);
    const leg = (matchId: string): Leg => ({ matchId, market: "h2h", outcome: "home", odds: 1.85, observedAt: now.toISOString(), label: "", matchLabel: "" });
    const r = reviewSlip([leg("ars-che"), leg("ars-2")], map, now);
    expect([...r.correlated]).toEqual([0, 1]);
    expect(r.probabilityIfIndependent).toBeNull();
  });
});
