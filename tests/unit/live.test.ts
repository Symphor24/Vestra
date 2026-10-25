import { describe, expect, it } from "vitest";
import { buildBoard } from "@/lib/live";

const m = (id: number, code: string, status: string, utcDate: string, homeId: number, score: [number | null, number | null] = [null, null]) => ({
  id,
  utcDate,
  status,
  lastUpdated: "2026-10-25T14:30:00Z",
  competition: { code },
  homeTeam: { id: homeId, name: `Home ${id}`, shortName: `H${id}` },
  awayTeam: { id: 9000 + id, name: `Away ${id}`, shortName: null },
  score: { fullTime: { home: score[0], away: score[1] } },
});

describe("buildBoard", () => {
  const board = buildBoard(
    {
      matches: [
        m(1, "PL", "FINISHED", "2026-10-25T12:00:00Z", 1, [2, 1]),
        m(2, "PL", "TIMED", "2026-10-25T16:00:00Z", 64), // Liverpool: popular
        m(3, "PL", "IN_PLAY", "2026-10-25T14:00:00Z", 2, [0, 0]),
        m(4, "SA", "PAUSED", "2026-10-25T14:00:00Z", 3, [1, 0]),
        m(5, "CL", "IN_PLAY", "2026-10-25T14:00:00Z", 5), // not one of the 5 leagues
        m(6, "FL1", "POSTPONED", "2026-10-25T13:00:00Z", 10),
      ],
    },
    "2026-10-25T14:31:00Z",
  );

  it("ignores other competitions and counts live + half-time", () => {
    expect(board.liveCount).toBe(2);
    expect(board.leagues.flatMap((l) => l.matches).map((x) => x.id)).not.toContain("5");
  });

  it("orders each league live, then upcoming, then finished", () => {
    expect(board.leagues.find((l) => l.code === "PL")!.matches.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });

  it("keeps league order, drops empty leagues, maps postponed to off", () => {
    expect(board.leagues.map((l) => l.code)).toEqual(["PL", "SA", "FL1"]);
    expect(board.leagues.at(-1)!.matches[0].state).toBe("off");
  });

  it("flags popular clubs and falls back to the full name", () => {
    expect(board.popular.map((x) => x.id)).toEqual(["2"]);
    expect(board.popular[0].away.name).toBe("Away 2");
  });

  it("rejects a malformed payload", () => {
    expect(() => buildBoard({ matches: [{ id: 1 }] }, "")).toThrow();
  });
});
