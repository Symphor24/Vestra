import { describe, expect, it } from "vitest";
import { displayStatus } from "@/lib/combos/display";
import type { LiveMatch } from "@/lib/live";
import type { Ticket } from "@/lib/types";

const leg = (footballDataId: string, market: Ticket["legs"][number]["market"], outcome: string, result: Ticket["legs"][number]["result"] = null) => ({
  matchId: footballDataId, market, outcome, odds: 2, observedAt: "", label: "", matchLabel: "", rationale: "",
  result, kickoffAt: "", footballDataId, matchState: "scheduled" as const, homeScore: null, awayScore: null,
});
const ticket = (legs: Ticket["legs"], result: Ticket["result"] = null): Ticket => ({
  id: "t", tier: 5, legs, totalOdds: 4, probability: 0.2, featured: false, result, matchDay: null, generatedAt: "", methodologyVersion: "2",
});
const live = (id: string, state: LiveMatch["state"], h: number, a: number, status = ""): LiveMatch => ({
  id, league: "PL", kickoffAt: "", state, status, updatedAt: "", home: { id: 1, name: "H", crest: null, score: h }, away: { id: 2, name: "A", crest: null, score: a }, popular: false,
});
const board = (...m: LiveMatch[]) => new Map(m.map((x) => [x.id, x]));

describe("displayStatus", () => {
  it("keeps a leg lost in the database even when the live feed disagrees", () => {
    const t = ticket([leg("1", "h2h", "home", "lost"), leg("2", "btts", "yes")]);
    expect(displayStatus(t, board(live("1", "live", 3, 0), live("2", "live", 1, 1))).status).toBe("lost");
  });

  it("settles a leg from the live score, and stays pending while another leg is open", () => {
    const t = ticket([leg("1", "btts", "yes"), leg("2", "h2h", "home")]);
    const d = displayStatus(t, board(live("1", "live", 1, 1), live("2", "live", 1, 0)));
    expect(d.legStatus).toEqual(["won", "pending"]);
    expect(d.status).toBe("pending");
    expect(d.live[0]?.id).toBe("1");
  });

  it("turns the ticket won once every leg is settled won", () => {
    const t = ticket([leg("1", "btts", "yes"), leg("2", "h2h", "home", "won")]);
    expect(displayStatus(t, board(live("1", "live", 1, 1))).status).toBe("won");
  });

  it("uses the database result and ignores the live feed", () => {
    const t = ticket([leg("1", "btts", "yes"), leg("2", "h2h", "home")], "won");
    expect(displayStatus(t, board(live("1", "live", 0, 0))).status).toBe("won");
  });

  it("is pending without a live match, and void when the match is off", () => {
    const t = ticket([leg("1", "h2h", "home"), { ...leg("", "h2h", "home"), footballDataId: null }]);
    expect(displayStatus(t, board()).legStatus).toEqual(["pending", "pending"]);
    expect(displayStatus(ticket([leg("1", "h2h", "home")]), board(live("1", "off", 0, 0, "POSTPONED"))).legStatus).toEqual(["void"]);
  });

  it("keeps a leg pending when the match is only suspended", () => {
    const d = displayStatus(ticket([leg("1", "h2h", "home")]), board(live("1", "off", 0, 0, "SUSPENDED")));
    expect(d.legStatus).toEqual(["pending"]);
    expect(d.status).toBe("pending");
  });
});
