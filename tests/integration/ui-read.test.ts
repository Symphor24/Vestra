import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { generateCombos } from "../../scripts/lib/combos";
import { loadMatches } from "../../scripts/lib/matches";
import { parseMatches, parseTickets } from "../../src/lib/supabase/parse";
import { after, seedTwoSyncs, T1 } from "./fixtures";
import { freshDb } from "./setup-db";

// What the web app reads (anon key → RLS) must equal what the scripts computed from.
let db: PGlite;

async function asAnon(fn: string, at: Date) {
  await db.exec("set role anon");
  try {
    return (await db.query<{ j: unknown }>(`select public.${fn}($1) as j`, [at.toISOString()])).rows[0].j;
  } finally {
    await db.exec("reset role");
  }
}

beforeEach(async () => {
  db = await freshDb();
  await seedTwoSyncs(db);
});

describe("ui_matches", () => {
  it("returns, as a visitor, exactly the matches the scripts see", async () => {
    const ui = parseMatches(await asAnon("ui_matches", T1));
    const scripts = (await loadMatches(db, T1)).map((m) => {
      const { bookmakerCount, ...rest } = m;
      expect(bookmakerCount).toBe(3); // scripts-only field, not sent to the UI
      return { ...rest, homeScore: null, awayScore: null };
    });
    expect(ui).toEqual(scripts);
    expect(ui[0].kickoffAt).toMatch(/Z$/); // normalised timestamps
  });

  it("shows finished matches with their score, hides started ones without a result", async () => {
    await db.exec(`update public.matches set status = 'finished', home_score = 2, away_score = 1 where external_id = 'evt-1'`);
    const later = after(49.5); // evt-1 kicked off at +49 h, evt-2 at +50 h
    const ui = parseMatches(await asAnon("ui_matches", later));
    expect(ui.map((m) => [m.status, m.homeScore])).toEqual([
      ["finished", 2],
      ["scheduled", null],
      ["scheduled", null],
      ["scheduled", null],
      ["scheduled", null],
    ]);
    const muchLater = after(52.5); // evt-2, 3 and 4 started without a result: hidden; evt-5 still ahead
    expect(parseMatches(await asAnon("ui_matches", muchLater)).map((m) => m.status)).toEqual(["finished", "scheduled"]);
  });

  it("respects RLS: a disabled competition disappears", async () => {
    await db.exec("update public.competitions set is_enabled = false where external_id = 'soccer_epl'");
    expect(await asAnon("ui_matches", T1)).toEqual([]);
  });
});

describe("ui_tickets", () => {
  it("returns active tickets with readable legs", async () => {
    await generateCombos(db, T1);
    const tickets = parseTickets(await asAnon("ui_tickets", T1));
    expect(tickets.map((t) => [t.category, t.legs.length])).toEqual([
      ["intermediate", 5],
      ["moderate", 2],
    ]);
    expect(tickets[1].legs[0]).toMatchObject({ outcome: "home", odds: 1.75, label: "Victoire Home 1", matchLabel: "Home 1 – Away 1" });
    expect(tickets[1].legs[0].rationale).toContain("2.00 à 1.75");
  });

  it("hides expired and invalidated tickets", async () => {
    await generateCombos(db, T1);
    expect(await asAnon("ui_tickets", after(49.5))).toEqual([]); // first kickoff passed
    await db.exec("update public.tickets set status = 'invalidated'");
    expect(await asAnon("ui_tickets", T1)).toEqual([]);
  });
});

describe("parse", () => {
  it("rejects malformed data instead of rendering it", () => {
    expect(() => parseMatches([{ id: "1" }])).toThrow();
    expect(() => parseTickets([{ id: "t", category: "moderate", totalOdds: 0.5, generatedAt: "x", methodologyVersion: "1", legs: [] }])).toThrow();
  });
});
