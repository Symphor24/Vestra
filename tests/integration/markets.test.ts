import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFootball } from "../../scripts/lib/api-football";
import { withSyncRun } from "../../scripts/lib/main";
import { ingestMarkets, marketRows, pickMarketsBookmaker } from "../../scripts/lib/markets-ingest";
import { afFixtures, afOdds, BETS, book, fakeAf } from "./af-fixtures";
import { seedTwoSyncs } from "./fixtures";
import { freshDb } from "./setup-db";

const MORNING = new Date("2026-10-25T07:30:00Z");
const AFTERNOON = new Date("2026-10-25T13:30:00Z");
let db: PGlite;

beforeEach(async () => {
  db = await freshDb();
  await seedTwoSyncs(db);
});

const count = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);

describe("ingestMarkets", () => {
  it("links fixtures and stores every complete market", async () => {
    const { af } = fakeAf();
    const r = await ingestMarkets(db, af, MORNING);
    expect(r.linked).toBe(5);
    expect(await count("select count(*) n from matches where api_football_id is not null")).toBe(5);
    const keys = (await db.query<{ market_key: string }>("select distinct market_key from odds_snapshots where bookmaker = 'bet365' order by 1")).rows;
    expect(keys.map((k) => k.market_key)).toEqual(["btts", "double_chance", "h2h", "totals_1.5", "totals_2.5", "totals_3.5"]);
    expect(r.snapshots).toBe(5 * 14);
  });

  it("drops an incomplete market but keeps the others", async () => {
    const noUnder = { ...BETS[5], values: BETS[5].values.filter((v) => v.value !== "Under 2.5") };
    const { af } = fakeAf({ odds: (id) => afOdds(id, [book("Bet365", [BETS[1], BETS[12], noUnder, BETS[8]])]) });
    await ingestMarkets(db, af, MORNING);
    expect(await count("select count(*) n from odds_snapshots where market_key = 'totals_2.5'")).toBe(0);
    expect(await count("select count(distinct market_key) n from odds_snapshots where bookmaker = 'bet365'")).toBe(5);
  });

  it("skips and reports an ambiguous fixture", async () => {
    const dup = { ...afFixtures()[0], id: 999, home: "Home X", away: "Away X" };
    const { af } = fakeAf({ fixtures: [...afFixtures(), dup] });
    const r = await ingestMarkets(db, af, MORNING);
    expect(r.linked).toBe(4);
    expect(r.unmatched).toEqual(["Home 1 – Away 1"]);
    expect(await count("select count(*) n from matches where api_football_id is not null")).toBe(4);
  });

  it("stops at the daily budget and records requests used", async () => {
    const { af } = fakeAf();
    const r = await withSyncRun(db, "ingest-markets", async () => {
      const result = await ingestMarkets(db, af, MORNING, 3);
      return { items: result.snapshots, result, credits: result.requests };
    });
    expect(r.requests).toBe(3);
    const runs = (await db.query<{ credits_used: number }>("select credits_used from sync_runs where job = 'ingest-markets'")).rows;
    expect(runs).toEqual([{ credits_used: 3 }]);
    // The next run of the day only has what is left.
    expect((await ingestMarkets(db, af, AFTERNOON, 3)).requests).toBe(0);
  });

  it("keeps the bookmaker chosen on the first pass", async () => {
    await ingestMarkets(db, fakeAf({ odds: (id) => afOdds(id, [book("SmallBook", [BETS[1]])]) }).af, MORNING);
    await ingestMarkets(db, fakeAf({ odds: (id) => afOdds(id, [book("SmallBook", [BETS[1]]), book("Bet365")]) }).af, AFTERNOON);
    const rows = (await db.query<{ markets_bookmaker: string }>("select distinct markets_bookmaker from matches where api_football_id is not null")).rows;
    expect(rows).toEqual([{ markets_bookmaker: "smallbook" }]);
    expect(await count("select count(*) n from odds_snapshots where bookmaker = 'bet365'")).toBe(0);
  });

  it("does nothing outside the two windows", async () => {
    const { af, calls } = fakeAf();
    const r = await ingestMarkets(db, af, new Date("2026-10-25T18:20:00Z"));
    expect(r.requests).toBe(0);
    expect(calls).toEqual({ fixtures: 0, odds: 0 });
  });
});

describe("marketRows / pickMarketsBookmaker", () => {
  it("prefers bet365 when it has the four bets, else the fullest book", () => {
    const o = afOdds(1, [book("Zeta", [BETS[1], BETS[8]]), book("Alpha", [BETS[1], BETS[8]]), book("Bet365")]);
    expect(pickMarketsBookmaker(o)).toBe("bet365");
    expect(pickMarketsBookmaker(afOdds(1, [book("Zeta", [BETS[1], BETS[8]]), book("Alpha", [BETS[1], BETS[8]])]))).toBe("alpha");
  });

  it("maps the picks to our keys", () => {
    const rows = marketRows(afOdds(1), "bet365");
    expect(rows).toContainEqual({ market: "double_chance", pick: "X2", odds: 2.75 });
    expect(rows).toContainEqual({ market: "totals_3.5", pick: "under", odds: 1.4 });
    expect(rows.some((r) => r.market === ("totals_0.5" as never))).toBe(false);
  });
});

describe("apiFootball", () => {
  const reply = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

  it("turns a rateLimit error in a 200 response into HTTP 429", async () => {
    const af = apiFootball("k".repeat(12), reply({ errors: { rateLimit: "Too many requests" }, response: [] }), 0);
    await expect(af.fixtures("2026-10-26")).rejects.toMatchObject({ status: 429 });
  });

  it("parses fixtures and returns null when a fixture has no odds", async () => {
    const fx = { fixture: { id: 7, date: "2026-10-26T19:45:00+00:00", status: { short: "NS" } }, league: { id: 39 }, teams: { home: { name: "A" }, away: { name: "B" } } };
    expect(await apiFootball("k".repeat(12), reply({ errors: [], response: [fx] }), 0).fixtures("2026-10-26")).toEqual([
      { id: 7, date: "2026-10-26T19:45:00+00:00", leagueId: 39, home: "A", away: "B", status: "NS" },
    ]);
    expect(await apiFootball("k".repeat(12), reply({ errors: [], response: [] }), 0).odds(7)).toBeNull();
  });
});
