import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { analyzeMatches } from "../../scripts/lib/analyze";
import type { AfOdds } from "../../scripts/lib/api-football";
import { generateCombos } from "../../scripts/lib/combos";
import { ingestMarkets } from "../../scripts/lib/markets-ingest";
import { TIERS } from "../../src/lib/combos/tiers";
import { afOdds, fakeAf } from "./af-fixtures";
import { loadMatches } from "../../scripts/lib/matches";
import type { OddsEvent } from "../../scripts/lib/odds-api";
import { after, ev, five, ingestAt as ingestAtDb, SHORT, seedTwoSyncs, T0, T1 } from "./fixtures";
import { freshDb } from "./setup-db";

// Ingestion → analysis → combos, on the real schema, with a fake provider.

let db: PGlite;
const quality = async () =>
  (await db.query<{ q: string; n: number }>("select data_quality_status as q, count(*)::int as n from public.matches_analysis group by 1 order by 1")).rows;

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
  it("loads matches in the shape the generator and UI share", async () => {
    const [m] = await loadMatches(db, T1);
    expect(m).toMatchObject({ bookmaker: "pinnacle", status: "scheduled", bookmakerCount: 3, consensus: { home: 1.75 } });
    expect(m.h2h.home.map((p) => p.odds)).toEqual([2, 1.75]);
    expect(m.confirmedAt).toBe(T1.toISOString());
  });

  describe("tomorrow tickets", () => {
  const MORNING = new Date("2026-10-25T07:30:00Z");
  const AFTERNOON = new Date("2026-10-25T13:30:00Z");
  const GENERATE_AT = new Date("2026-10-25T13:45:00Z");
  // Afternoon: every other match's prices shorten by 5 %, so some legs come out `dropped`.
  const shorter = (id: number): AfOdds => {
    const o = afOdds(id);
    if (id % 2) return { ...o, update: AFTERNOON.toISOString() };
    const bets = o.bookmakers[0].bets.map((b) => ({ ...b, values: b.values.map((v) => ({ ...v, odd: (Number(v.odd) * 0.95).toFixed(2) })) }));
    return { ...o, update: AFTERNOON.toISOString(), bookmakers: [{ ...o.bookmakers[0], bets }] };
  };
  const ticketRows = async () =>
    (await db.query<{ category: string; match_day: string; p: number; featured: boolean; generated_at: string }>(
      "select category, match_day::text as match_day, estimated_probability::float8 as p, featured, generated_at::text from public.tickets order by category",
    )).rows;

  beforeEach(async () => {
    await ingestMarkets(db, fakeAf({ odds: (id) => ({ ...afOdds(id), update: MORNING.toISOString() }) }).af, MORNING);
    await ingestMarkets(db, fakeAf({ odds: shorter }).af, AFTERNOON);
  });

  it("creates one ticket per reachable tier for tomorrow", async () => {
    const r = await generateCombos(db, GENERATE_AT);
    expect(r).toMatchObject({ day: "2026-10-26", skipped: null });
    expect(r.created).toBeGreaterThanOrEqual(1);
    const rows = await ticketRows();
    expect(rows).toHaveLength(r.created);
    expect(rows.every((t) => t.match_day === "2026-10-26" && (TIERS as readonly number[]).includes(Number(t.category)))).toBe(true);
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int as n from public.ticket_selections where rationale like '%cote en baisse'")).rows;
    expect(n).toBeGreaterThan(0);
  });

  it("is idempotent per match day", async () => {
    await generateCombos(db, GENERATE_AT);
    const before = await ticketRows();
    expect(await generateCombos(db, new Date("2026-10-25T16:00:00Z"))).toEqual({ day: "2026-10-26", created: 0, skipped: "already-generated" });
    expect(await ticketRows()).toEqual(before);
  });

  it("does nothing before 13:00 UTC", async () => {
    expect(await generateCombos(db, new Date("2026-10-25T08:00:00Z"))).toEqual({ day: "2026-10-26", created: 0, skipped: "before-13h" });
    expect(await ticketRows()).toEqual([]);
  });

  it("stores probability and featured", async () => {
    await generateCombos(db, GENERATE_AT);
    const rows = await ticketRows();
    expect(rows.every((t) => t.p > 0 && t.p < 1)).toBe(true);
    const featured = rows.filter((t) => t.featured);
    expect([2, 3]).toContain(featured.length);
    expect(featured.every((t) => ["2", "5", "10"].includes(t.category))).toBe(true);
  });
  });
});
