import { generateDay, type TierTicket } from "../../src/lib/combos/tiers.ts";
import { METHODOLOGY_VERSION } from "../../src/lib/combos/generate.ts";
import type { Db } from "./db.ts";
import { loadSelections } from "./selections.ts";

export interface CombosResult {
  day: string;
  created: number;
  skipped: "before-13h" | "already-generated" | null;
}

const GENERATION_HOUR_UTC = 13;

/** Tomorrow's tickets, built once from the day's markets and never touched again. */
export async function generateCombos(db: Db, now: Date): Promise<CombosResult> {
  const day = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  if (now.getUTCHours() < GENERATION_HOUR_UTC) return { day, created: 0, skipped: "before-13h" };
  const existing = await db.query("select 1 from public.tickets where match_day = $1::date limit 1", [day]);
  if (existing.rows.length) return { day, created: 0, skipped: "already-generated" };

  const tickets = generateDay(await loadSelections(db, day));
  if (!tickets.length) return { day, created: 0, skipped: null };
  const created = await insertDay(db, tickets, day, now);
  return { day, created, skipped: created ? null : "already-generated" };
}

/**
 * The whole day in one statement, so it is stored completely or not at all. A concurrent run that
 * lost the race inserts nothing (on conflict) and reports "already-generated".
 */
async function insertDay(db: Db, tickets: TierTicket[], day: string, now: Date): Promise<number> {
  const payload = tickets.map((t) => ({
    title: `Combiné ~${t.tier}`, category: String(t.tier), total_odds: t.totalOdds, probability: t.probability, featured: t.featured,
    legs: t.legs.map((l, i) => ({
      position: i + 1, match_id: l.matchId, market: l.market, pick: l.pick, odds: l.odds, observed_at: l.observedAt,
      rationale: `Cote ${l.odds.toFixed(2)}, probabilité selon le marché ${(l.probability * 100).toFixed(1)} %${l.dropped ? ", cote en baisse" : ""}`,
    })),
  }));
  const { rows } = await db.query(
    `with t as (
       insert into public.tickets (title, category, total_odds, estimated_probability, featured, match_day, generated_at, expires_at, methodology_version)
       select x.title, x.category, x.total_odds, x.probability, x.featured, $2::date, $3, null, $4
       from jsonb_to_recordset($1::jsonb) as x(title text, category text, total_odds numeric, probability numeric, featured boolean)
       on conflict (match_day, category) where match_day is not null do nothing
       returning id, category
     ), s as (
       insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, rationale, position)
       select t.id, l.match_id, l.market, l.pick, l.odds, l.observed_at, l.rationale, l.position
       from t
       join jsonb_to_recordset($1::jsonb) as x(category text, legs jsonb) on x.category = t.category
       cross join lateral jsonb_to_recordset(x.legs) as l(position int, match_id bigint, market text, pick text, odds numeric, observed_at timestamptz, rationale text)
     )
     select count(*)::int as n from t`,
    [JSON.stringify(payload), day, now.toISOString(), METHODOLOGY_VERSION],
  );
  return (rows[0] as { n: number }).n;
}
