import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestOdds } from "../../scripts/lib/ingest";
import type { FetchOdds, OddsEvent } from "../../scripts/lib/odds-api";
import { freshDb } from "./setup-db";

const NOW = new Date("2026-10-24T12:00:00Z");
const h = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

function event(id: string, home: string, away: string, kickoffHours: number, books: Record<string, [number, number, number]>, updatedHours = -1): OddsEvent {
  return {
    id,
    sport_key: "soccer_epl",
    commence_time: h(kickoffHours),
    home_team: home,
    away_team: away,
    bookmakers: Object.entries(books).map(([key, [ph, pd, pa]]) => ({
      key,
      title: key,
      last_update: h(updatedHours),
      markets: [{ key: "h2h", last_update: h(updatedHours), outcomes: [{ name: home, price: ph }, { name: away, price: pa }, { name: "Draw", price: pd }] }],
    })),
  };
}

/** Fake provider: `epl` events for the Premier League, nothing elsewhere, 1 credit per call. */
function provider(epl: OddsEvent[], { remaining = 400, fail = new Set<string>() } = {}) {
  return vi.fn<FetchOdds>(async (key) => {
    if (fail.has(key)) throw new Error("HTTP 503 sur /v4/sports");
    return { events: key === "soccer_epl" ? epl : [], creditsUsed: 1, creditsRemaining: remaining };
  });
}

let db: PGlite;
const count = async (sql: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n);
const run = (fetchOdds: FetchOdds, cap = 450) => ingestOdds({ db, fetchOdds, cap, now: () => NOW });

beforeEach(async () => {
  db = await freshDb();
});

const ARS_CHE = event("evt-1", "Arsenal", "Chelsea", 30, { unibet_eu: [2.1, 3.5, 3.4], pinnacle: [2.08, 3.55, 3.45] });
const LIV_AVL = event("evt-2", "Liverpool", "Aston Villa", 50, { unibet_eu: [1.6, 4.2, 5.0] });

describe("ingestOdds", () => {
  it("stores teams, matches and every valid price, and logs the run", async () => {
    const r = await run(provider([ARS_CHE, LIV_AVL]));
    expect(r).toMatchObject({ competitions: 5, events: 2, newSnapshots: 9, creditsUsed: 5, creditsRemaining: 400, errors: [] });
    expect(await count("public.teams")).toBe(4);
    expect(await count("public.matches")).toBe(2);
    const [run1] = (await db.query("select status, credits_used, items_written from public.sync_runs")).rows;
    expect(run1).toEqual({ status: "ok", credits_used: 5, items_written: 9 });
  });

  it("is idempotent: the same data a second time adds nothing", async () => {
    await run(provider([ARS_CHE]));
    const r = await run(provider([ARS_CHE]));
    expect(r.newSnapshots).toBe(0);
    expect(await count("public.matches")).toBe(1);
    expect(await count("public.odds_snapshots")).toBe(6);
  });

  it("records a new observation only when a bookmaker updates its price", async () => {
    await run(provider([ARS_CHE]));
    const moved = event("evt-1", "Arsenal", "Chelsea", 30, { unibet_eu: [1.95, 3.6, 3.9] }, -0.5);
    const r = await run(provider([moved]));
    expect(r.newSnapshots).toBe(3);
    const hist = (await db.query<{ odds_value: string }>(
      "select odds_value from public.odds_snapshots where bookmaker = 'unibet_eu' and selection_key = 'home' order by observed_at",
    )).rows.map((x) => Number(x.odds_value));
    expect(hist).toEqual([2.1, 1.95]);
  });

  it("keeps the first reference bookmaker, preferring sharp books", async () => {
    await run(provider([ARS_CHE]));
    await run(provider([event("evt-1", "Arsenal", "Chelsea", 30, { unibet_eu: [2, 3.5, 3.6] }, -0.5)]));
    const [m] = (await db.query("select reference_bookmaker from public.matches")).rows;
    expect(m).toEqual({ reference_bookmaker: "pinnacle" });
  });

  it("drops invalid markets and in-play events", async () => {
    const bad = event("evt-3", "Spurs", "Fulham", 20, { a: [1, 3, 3], b: [2, 3, 3] });
    bad.bookmakers[1].markets[0].outcomes.pop(); // incomplete market
    const future = event("evt-4", "Wolves", "Everton", 20, { c: [2, 3, 3] }, 2); // timestamp in the future
    const started = event("evt-5", "Leeds", "Burnley", -0.5, { d: [2, 3, 3] });
    const r = await run(provider([bad, future, started]));
    expect(r.events).toBe(2);
    expect(r.newSnapshots).toBe(0);
    expect(await count("public.matches where external_id = 'evt-5'")).toBe(0);
  });

  it("follows a postponed kickoff", async () => {
    await run(provider([ARS_CHE]));
    await run(provider([event("evt-1", "Arsenal", "Chelsea", 54, { unibet_eu: [2.1, 3.5, 3.4] })]));
    const [m] = (await db.query<{ kickoff_at: Date }>("select kickoff_at from public.matches")).rows;
    expect(new Date(m.kickoff_at).toISOString()).toBe(h(54));
  });

  it("refuses to run past the monthly credit cap, without calling the provider", async () => {
    await db.query("insert into public.sync_runs (job, status, credits_used) values ('ingest-odds', 'ok', 448)");
    const fetchOdds = provider([ARS_CHE]);
    const r = await run(fetchOdds, 450);
    expect(fetchOdds).not.toHaveBeenCalled();
    expect(r.errors[0]).toMatch(/Plafond mensuel/);
    const [last] = (await db.query("select status from public.sync_runs order by id desc limit 1")).rows;
    expect(last).toEqual({ status: "error" });
  });

  it("stops when the provider reports no credits left", async () => {
    const fetchOdds = provider([ARS_CHE], { remaining: 0 });
    const r = await run(fetchOdds);
    expect(fetchOdds).toHaveBeenCalledTimes(1);
    expect(r.errors).toEqual(["Quota du fournisseur épuisé : synchro interrompue"]);
  });

  it("isolates a failing competition and marks the run as failed", async () => {
    const r = await run(provider([ARS_CHE], { fail: new Set(["soccer_spain_la_liga"]) }));
    expect(r.competitions).toBe(4);
    expect(r.newSnapshots).toBe(6);
    expect(r.errors).toEqual(["soccer_spain_la_liga : HTTP 503 sur /v4/sports"]);
  });
});
