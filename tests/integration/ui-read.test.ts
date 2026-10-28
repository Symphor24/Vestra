import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
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

// A frozen ticket as generate-combos stores it: one h2h leg on the first seeded match.
const insertTicket = () =>
  db.exec(`
    with t as (
      insert into public.tickets (title, category, total_odds, estimated_probability, generated_at, methodology_version, match_day, featured)
      values ('Combiné ~2', '2', 1.75, 0.57, '${T1.toISOString()}', '1.0.0', '${T1.toISOString().slice(0, 10)}', true) returning id
    )
    insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, rationale, position)
    select t.id, (select min(id) from public.matches), 'h2h', 'home', 1.75, now(), 'Cote 1.75', 1 from t;
  `);

describe("ui_tickets", () => {
  it("returns tickets with readable legs", async () => {
    await insertTicket();
    const [t] = parseTickets(await asAnon("ui_tickets", T1));
    expect(t).toMatchObject({ tier: 2, featured: true, probability: 0.57, result: null });
    expect(t.legs).toHaveLength(1);
    expect(t.legs[0]).toMatchObject({ market: "h2h", outcome: "home", odds: 1.75, rationale: "Cote 1.75", matchState: "scheduled", footballDataId: null });
    expect(t.legs[0].label).toMatch(/^Victoire /);
  });

  it("keeps 30 days of history, including tickets whose matches have started", async () => {
    await insertTicket();
    expect(await asAnon("ui_tickets", after(49.5))).toHaveLength(1);
    expect(await asAnon("ui_tickets", after(24 * 31))).toEqual([]);
  });
});

describe("ui_tickets history", () => {
  it("returns ticket history with results, as a visitor", async () => {
    await db.exec(`
      insert into public.tickets (id, title, category, total_odds, status, result, generated_at, methodology_version, match_day, featured)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 't', '5', 5, 'settled', 'won', '${T1.toISOString()}'::timestamptz - interval '1 day', '0.2.0', '${T1.toISOString().slice(0, 10)}'::date - 1, false),
             ('aaaaaaaa-0000-0000-0000-000000000002', 't', '10', 10, 'active', null, '${T1.toISOString()}', '0.2.0', '${T1.toISOString().slice(0, 10)}', true);
      insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, position, result)
      select t.id, (select min(id) from public.matches), 'totals_2.5', 'over', 2, now(), 1, case when t.result = 'won' then 'won' end
      from public.tickets t;
    `);
    const tickets = parseTickets(await asAnon("ui_tickets", T1));
    expect(tickets.map((t) => [t.tier, t.result, t.featured])).toEqual([[10, null, true], [5, "won", false]]);
    expect(tickets[1].legs[0]).toMatchObject({ market: "totals_2.5", outcome: "over", result: "won", matchState: "scheduled", footballDataId: null });
    expect(tickets[1].legs[0].label).toBe("Plus de 2,5 buts");
  });
});

describe("parse", () => {
  it("rejects malformed data instead of rendering it", () => {
    expect(() => parseMatches([{ id: "1" }])).toThrow();
    expect(() => parseTickets([{ id: "t", category: "moderate", totalOdds: 0.5, generatedAt: "x", methodologyVersion: "1", legs: [] }])).toThrow();
  });
});
