import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { analyzeMatches } from "../../scripts/lib/analyze";
import { generateCombos } from "../../scripts/lib/combos";
import { loadMatches } from "../../scripts/lib/matches";
import type { OddsEvent } from "../../scripts/lib/odds-api";
import { after, ev, five, ingestAt as ingestAtDb, SHORT, seedTwoSyncs, T0, T1 } from "./fixtures";
import { freshDb } from "./setup-db";

// Ingestion → analysis → combos, on the real schema, with a fake provider.

let db: PGlite;
const quality = async () =>
  (await db.query<{ q: string; n: number }>("select data_quality_status as q, count(*)::int as n from public.matches_analysis group by 1 order by 1")).rows;
const tickets = async () =>
  (await db.query<{ category: string; status: string; legs: number }>(
    `select t.category, t.status, count(s.id)::int as legs from public.tickets t
     left join public.ticket_selections s on s.ticket_id = t.id group by t.id order by t.category, t.status`,
  )).rows;

const ingestAt = (when: Date, events: OddsEvent[]) => ingestAtDb(db, when, events);

beforeEach(async () => {
  db = await freshDb();
  await seedTwoSyncs(db);
});

describe("analysis", () => {
  it("writes one factual row per selection, with nulls where Vestra has no data", async () => {
    expect(await analyzeMatches(db, T1)).toBe(15);
    const [row] = (await db.query<Record<string, unknown>>(
      `select first_observed_odds::float8 as first, current_odds::float8 as cur, odds_change_percent::float8 as chg,
              observation_count as n, bookmaker_count as books, consensus_odds::float8 as cons,
              opening_odds, model_probability, confidence_score, data_quality_status as q, rationale
       from public.matches_analysis a join public.matches m on m.id = a.match_id
       where m.external_id = 'evt-1' and a.selection_key = 'home'`,
    )).rows;
    expect(row).toMatchObject({
      first: 2, cur: 1.75, chg: -12.5, n: 2, books: 3, cons: 1.75,
      opening_odds: null, model_probability: null, confidence_score: null, q: "ok",
    });
    expect(row.rationale).toContain("2.00 à 1.75");
  });

  it("re-running updates rows instead of duplicating them", async () => {
    await analyzeMatches(db, T1);
    await analyzeMatches(db, T1);
    expect(await quality()).toEqual([{ q: "ok", n: 15 }]);
  });

  it("keeps an unchanged price fresh while syncs keep confirming it", async () => {
    const T2 = after(16, T0); // 10 h after the last price change… but confirmed by a sync at T2
    await ingestAt(T2, five(SHORT, after(-0.5, T1)));
    await analyzeMatches(db, after(4, T2));
    expect(await quality()).toEqual([{ q: "ok", n: 15 }]);
    await analyzeMatches(db, after(13, T2)); // no sync for 13 h
    expect(await quality()).toEqual([{ q: "stale", n: 15 }]);
  });

  it("flags an off-market reference price", async () => {
    const T2 = after(1, T1);
    await ingestAt(T2, [ev(1, [1.6, 3.8, 5.5], T2, [1.9, 3.5, 4.0])]);
    await analyzeMatches(db, T2);
    const [r] = (await db.query("select data_quality_status as q from public.matches_analysis a join public.matches m on m.id = a.match_id where m.external_id = 'evt-1' and selection_key = 'home'")).rows;
    expect(r).toEqual({ q: "divergent" });
  });
});

describe("combos", () => {
  it("builds tickets from stored data and never pads an unreachable category", async () => {
    const r = await generateCombos(db, T1);
    expect(r).toEqual({ created: 2, kept: 0, invalidated: 0, expired: 0 });
    // 1.75^2 = 3.06 (moderate), 1.75^5 = 16.4 (intermediate); 100+ is out of reach with 5 legs.
    expect(await tickets()).toEqual([
      { category: "intermediate", status: "active", legs: 5 },
      { category: "moderate", status: "active", legs: 2 },
    ]);
    const [t] = (await db.query<Record<string, unknown>>("select estimated_probability, expires_at, methodology_version from public.tickets where category = 'moderate'")).rows;
    expect(t.estimated_probability).toBeNull();
    expect(new Date(t.expires_at as string).toISOString()).toBe(after(49).toISOString()); // first kickoff among its legs
  });

  it("keeps identical tickets, invalidates changed ones", async () => {
    await generateCombos(db, T1);
    expect(await generateCombos(db, after(1, T1))).toEqual({ created: 0, kept: 2, invalidated: 0, expired: 0 });

    const T2 = after(2, T1);
    await ingestAt(T2, five([1.7, 3.7, 4.9], after(-0.2, T2)));
    expect(await generateCombos(db, T2)).toEqual({ created: 2, kept: 0, invalidated: 2, expired: 0 });
    expect((await tickets()).map((t) => t.status).sort()).toEqual(["active", "active", "invalidated", "invalidated"]);
  });

  it("expires active tickets once their first match has started", async () => {
    await generateCombos(db, T1);
    const r = await generateCombos(db, after(49.5));
    expect(r.expired).toBe(2);
    expect(r.created).toBe(0); // matches 1..5 still open but prices are now stale (> 12 h)
  });

  it("loads matches in the shape the generator and UI share", async () => {
    const [m] = await loadMatches(db, T1);
    expect(m).toMatchObject({ bookmaker: "pinnacle", status: "scheduled", bookmakerCount: 3, consensus: { home: 1.75 } });
    expect(m.h2h.home.map((p) => p.odds)).toEqual([2, 1.75]);
    expect(m.confirmedAt).toBe(T1.toISOString());
  });
});
