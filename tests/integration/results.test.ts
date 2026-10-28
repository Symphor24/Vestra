import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FdMatch, FetchFdMatches } from "../../scripts/lib/football-data";
import { findFixture, ingestResults, sameTeam } from "../../scripts/lib/results";
import { settleTickets } from "../../scripts/lib/settle-tickets";
import { ingestAt } from "./fixtures";
import { freshDb } from "./setup-db";
import type { OddsEvent } from "../../scripts/lib/odds-api";

const KICK = new Date("2026-10-25T14:00:00Z");
const NOW = new Date("2026-10-25T20:00:00Z");

const fd = (id: number, home: [number, string, string], away: [number, string, string], utc = KICK, status = "FINISHED", score: [number | null, number | null] = [2, 1]): FdMatch => ({
  id,
  utcDate: utc.toISOString(),
  status,
  homeTeam: { id: home[0], name: home[1], shortName: home[2] },
  awayTeam: { id: away[0], name: away[1], shortName: away[2] },
  score: { fullTime: { home: score[0], away: score[1] } },
});

describe("sameTeam", () => {
  it.each([
    ["Arsenal", "Arsenal FC", true],
    ["Brighton and Hove Albion", "Brighton & Hove Albion FC", true],
    ["Atletico Madrid", "Club Atlético de Madrid", true],
    ["Bayer Leverkusen", "Bayer 04 Leverkusen", true],
    ["Paris Saint Germain", "Paris Saint-Germain FC", true],
    ["Manchester City", "Manchester United FC", false],
    ["Real Madrid", "Real Sociedad de Fútbol", false],
    ["Inter Milan", "FC Internazionale Milano", false], // recovered through the other side of the fixture
  ])("%s vs %s → %s", (a, b, want) => expect(sameTeam(a, b)).toBe(want));
});

describe("findFixture", () => {
  const side = (id: string, name: string) => ({ id, name, external_id: null });
  const interLazio = { id: "1", kickoff: KICK, code: "SA", home: side("h", "Inter Milan"), away: side("a", "Lazio") };

  it("recovers a fixture from one recognised side", () => {
    const f = fd(10, [108, "FC Internazionale Milano", "Inter"], [110, "SS Lazio", "Lazio"]);
    expect(findFixture(interLazio, [f])?.id).toBe(10);
  });

  it("does not confuse the two Milan clubs on the same weekend", () => {
    const milan = fd(11, [98, "AC Milan", "Milan"], [113, "SSC Napoli", "Napoli"], new Date(KICK.getTime() + 27 * 3_600_000));
    const inter = fd(10, [108, "FC Internazionale Milano", "Inter"], [110, "SS Lazio", "Lazio"]);
    expect(findFixture(interLazio, [milan, inter])?.id).toBe(10);
  });

  it("returns null when ambiguous", () => {
    // Two Lazio away fixtures 20 h either side, neither at the same kickoff time.
    const a = fd(1, [1, "X", "X"], [110, "SS Lazio", "Lazio"], new Date(KICK.getTime() + 20 * 3_600_000));
    const b = fd(2, [3, "Y", "Y"], [110, "SS Lazio", "Lazio"], new Date(KICK.getTime() - 20 * 3_600_000));
    expect(findFixture({ ...interLazio, home: side("h", "Nobody") }, [a, b])).toBeNull();
  });
});

describe("ingestResults", () => {
  let db: PGlite;
  const event = (id: string, home: string, away: string): OddsEvent => ({
    id, sport_key: "soccer_epl", commence_time: KICK.toISOString(), home_team: home, away_team: away,
    bookmakers: [{ key: "pinnacle", title: "p", last_update: new Date(KICK.getTime() - 86_400_000).toISOString(),
      markets: [{ key: "h2h", outcomes: [{ name: home, price: 2 }, { name: "Draw", price: 3.4 }, { name: away, price: 3.6 }] }] }],
  });

  beforeEach(async () => {
    db = await freshDb();
    await ingestAt(db, new Date(KICK.getTime() - 86_400_000), [
      event("e1", "Wolverhampton Wanderers", "Tottenham Hotspur"),
      event("e2", "Brighton and Hove Albion", "Fulham"),
      event("e3", "Nottingham Forest", "Everton"),
    ]);
  });

  it("records scores, postponements, learns ids and short names, reports unmatched", async () => {
    const fetchMatches = vi.fn<FetchFdMatches>(async () => [
      fd(501, [76, "Wolverhampton Wanderers FC", "Wolves"], [73, "Tottenham Hotspur FC", "Tottenham"]),
      fd(502, [397, "Brighton & Hove Albion FC", "Brighton Hove"], [63, "Fulham FC", "Fulham"], KICK, "POSTPONED", [null, null]),
    ]);
    const r = await ingestResults(db, fetchMatches, NOW);
    expect(r).toEqual({ finished: 1, postponedOrCancelled: 1, linked: 0, unmatched: ["Nottingham Forest – Everton"], errors: [] });
    expect(fetchMatches).toHaveBeenCalledWith("PL", "2026-10-24", "2026-10-26");

    const rows = (await db.query("select external_id, status, home_score, away_score, football_data_id from public.matches order by external_id")).rows;
    expect(rows).toEqual([
      { external_id: "e1", status: "finished", home_score: 2, away_score: 1, football_data_id: "501" },
      { external_id: "e2", status: "postponed", home_score: null, away_score: null, football_data_id: "502" },
      { external_id: "e3", status: "scheduled", home_score: null, away_score: null, football_data_id: null },
    ]);
    const wolves = (await db.query("select external_id, short_name from public.teams where name = 'Wolverhampton Wanderers'")).rows[0];
    expect(wolves).toEqual({ external_id: "76", short_name: "Wolves" });
  });

  it("brings a postponed match back when the odds provider gives a new date", async () => {
    await db.exec("update public.matches set status = 'postponed' where external_id = 'e2'");
    const later = new Date(KICK.getTime() + 7 * 86_400_000);
    await ingestAt(db, NOW, [{ ...event("e2", "Brighton and Hove Albion", "Fulham"), commence_time: later.toISOString() }]);
    const [m] = (await db.query("select status from public.matches where external_id = 'e2'")).rows;
    expect(m).toEqual({ status: "scheduled" });
  });

  it("links upcoming matches without changing their status", async () => {
    const fetchMatches = vi.fn<FetchFdMatches>(async () => [
      fd(501, [76, "Wolverhampton Wanderers FC", "Wolves"], [73, "Tottenham Hotspur FC", "Tottenham"], KICK, "TIMED", [null, null]),
    ]);
    const r = await ingestResults(db, fetchMatches, new Date(KICK.getTime() - 20 * 3_600_000));
    expect(r.linked).toBe(1);
    expect(fetchMatches).toHaveBeenCalledTimes(1);
    const rows = (await db.query("select external_id, status, football_data_id from public.matches where football_data_id is not null")).rows;
    expect(rows).toEqual([{ external_id: "e1", status: "scheduled", football_data_id: "501" }]);
  });

  it("keeps going when one league's provider call fails", async () => {
    const r = await ingestResults(db, async () => {
      throw new Error("HTTP 429");
    }, NOW);
    expect(r.errors).toEqual(["PL : HTTP 429"]);
  });
});

describe("settleTickets", () => {
  let db: PGlite;
  const ticket = async (legs: [string, string, string][]) => {
    const [{ id }] = (await db.query<{ id: string }>(
      "insert into public.tickets (title, category, total_odds, generated_at, methodology_version) values ('t', '5', 5, $1, 'v') returning id::text as id", [NOW.toISOString()],
    )).rows;
    for (const [i, [ext, market, pick]] of legs.entries()) {
      await db.query(
        "insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, position) select $1, id, $3, $4, 2, $5, $6 from public.matches where external_id = $2",
        [id, ext, market, pick, NOW.toISOString(), i + 1],
      );
    }
    return id;
  };
  const state = async (id: string) => (await db.query("select result, status, settled_at from public.tickets where id = $1", [id])).rows[0];
  const event = (id: string, home: string, away: string): OddsEvent => ({
    id, sport_key: "soccer_epl", commence_time: KICK.toISOString(), home_team: home, away_team: away,
    bookmakers: [{ key: "pinnacle", title: "p", last_update: new Date(KICK.getTime() - 86_400_000).toISOString(),
      markets: [{ key: "h2h", outcomes: [{ name: home, price: 2 }, { name: "Draw", price: 3.4 }, { name: away, price: 3.6 }] }] }],
  });

  beforeEach(async () => {
    db = await freshDb();
    await ingestAt(db, new Date(KICK.getTime() - 86_400_000), [event("e1", "Fulham", "Everton"), event("e2", "Arsenal", "Chelsea")]);
  });

  it("settles legs and tickets from final scores", async () => {
    await db.exec("update public.matches set status = 'finished', home_score = 2, away_score = 1 where external_id = 'e1'");
    await db.exec("update public.matches set status = 'finished', home_score = 1, away_score = 0 where external_id = 'e2'");
    const id = await ticket([["e1", "totals_2.5", "over"], ["e2", "btts", "yes"]]);
    expect(await settleTickets(db, NOW)).toEqual({ legs: 2, tickets: 1 });
    const legs = (await db.query("select result from public.ticket_selections order by position")).rows;
    expect(legs).toEqual([{ result: "won" }, { result: "lost" }]);
    expect(await state(id)).toMatchObject({ result: "lost", status: "settled" });
  });

  it("voids the leg of a postponed match", async () => {
    await db.exec("update public.matches set status = 'finished', home_score = 2, away_score = 1 where external_id = 'e1'");
    await db.exec("update public.matches set status = 'postponed' where external_id = 'e2'");
    const id = await ticket([["e1", "totals_2.5", "over"], ["e2", "btts", "yes"]]);
    await settleTickets(db, NOW);
    expect(await state(id)).toMatchObject({ result: "won", status: "settled" });
  });

  it("never touches a settled ticket", async () => {
    await db.exec("update public.matches set status = 'finished', home_score = 2, away_score = 1");
    const id = await ticket([["e1", "h2h", "home"]]);
    await settleTickets(db, NOW);
    const first = await state(id);
    expect(await settleTickets(db, new Date(NOW.getTime() + 3_600_000))).toEqual({ legs: 0, tickets: 0 });
    expect(await state(id)).toEqual(first);
  });
});
