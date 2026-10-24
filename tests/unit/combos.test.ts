import { describe, expect, it } from "vitest";
import { buildLegs, eligibleCandidates, generateTickets, type Candidate } from "@/lib/combos/generate";
import { reviewSlip, ticketText } from "@/lib/combos/slip";
import { buildDemoMatches } from "@/lib/demo/data";
import type { Leg } from "@/lib/types";

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

describe("buildLegs / generateTickets", () => {
  it("is deterministic and keeps totals inside each target band", () => {
    const a = generateTickets(matches, now);
    expect(generateTickets(matches, now)).toEqual(a);
    const band = { moderate: [2, 5], intermediate: [10, 50], high: [100, Infinity] } as const;
    for (const t of a) {
      const [min, max] = band[t.category];
      expect(t.totalOdds).toBeGreaterThanOrEqual(min);
      expect(t.totalOdds).toBeLessThanOrEqual(max);
      expect(new Set(t.legs.map((l) => l.matchId)).size).toBe(t.legs.length);
    }
  });

  it("returns nothing rather than padding when the target is out of reach", () => {
    const few = eligibleCandidates(matches, now).slice(0, 2) as Candidate[];
    expect(buildLegs(few, "high")).toBeNull();
    expect(generateTickets([], now)).toEqual([]);
  });
});

describe("reviewSlip", () => {
  const leg = (matchId: string, outcome: Leg["outcome"], odds: number): Leg => ({
    matchId, outcome, odds, observedAt: now.toISOString(), label: outcome, matchLabel: matchId,
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
