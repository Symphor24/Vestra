import { describe, expect, it } from "vitest";
import { settleLeg, ticketStatus } from "@/lib/combos/settle";

describe("settleLeg", () => {
  it.each([
    ["totals_1.5", "over", 1, 1, "live", "won"],
    ["totals_1.5", "over", 1, 0, "live", "pending"],
    ["totals_1.5", "over", 1, 0, "finished", "lost"],
    ["totals_2.5", "under", 2, 1, "live", "lost"],
    ["totals_2.5", "under", 1, 1, "finished", "won"],
    ["btts", "yes", 1, 1, "live", "won"],
    ["btts", "yes", 2, 0, "finished", "lost"],
    ["btts", "no", 1, 1, "live", "lost"],
    ["btts", "no", 2, 0, "live", "pending"],
    ["btts", "no", 2, 0, "finished", "won"],
    ["h2h", "home", 3, 0, "live", "pending"],
    ["h2h", "home", 3, 0, "finished", "won"],
    ["h2h", "draw", 3, 0, "finished", "lost"],
    ["double_chance", "X2", 1, 1, "finished", "won"],
    ["double_chance", "12", 1, 1, "finished", "lost"],
    ["double_chance", "1X", 1, 1, "live", "pending"],
    ["h2h", "home", null, null, "void", "void"],
    ["btts", "yes", null, null, "scheduled", "pending"],
    ["h2h", "home", null, null, "finished", "pending"],
  ] as const)("%s %s %s-%s %s -> %s", (m, p, h, a, s, r) => {
    expect(settleLeg(m, p, h, a, s)).toBe(r);
  });
});

describe("ticketStatus", () => {
  it.each([
    [["won", "pending"], "pending"],
    [["won", "lost", "pending"], "lost"],
    [["won", "void"], "won"],
    [["void", "void"], "void"],
    [["void", "pending"], "pending"],
  ] as const)("%j -> %s", (legs, r) => {
    expect(ticketStatus([...legs])).toBe(r);
  });
});
