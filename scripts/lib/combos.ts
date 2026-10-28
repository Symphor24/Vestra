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
  for (const t of tickets) await insertTicket(db, t, day, now);
  return { day, created: tickets.length, skipped: null };
}

/** One statement, so a ticket is never stored without its selections. */
async function insertTicket(db: Db, t: TierTicket, day: string, now: Date) {
  await db.query(
    `with t as (
       insert into public.tickets (title, category, total_odds, estimated_probability, featured, match_day, generated_at, expires_at, methodology_version)
       values ($1, $2, $3, $4, $5, $6::date, $7, null, $8) returning id
     )
     insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, rationale, position)
     select t.id, x.m, x.k, x.s, x.o, x.at, x.r, x.p
     from t, unnest($9::bigint[], $10::text[], $11::text[], $12::numeric[], $13::timestamptz[], $14::text[], $15::int[]) as x(m, k, s, o, at, r, p)`,
    [
      `Combiné ~${t.tier}`, String(t.tier), t.totalOdds, t.probability, t.featured, day, now.toISOString(), METHODOLOGY_VERSION,
      t.legs.map((l) => l.matchId), t.legs.map((l) => l.market), t.legs.map((l) => l.pick), t.legs.map((l) => l.odds),
      t.legs.map((l) => l.observedAt),
      t.legs.map((l) => `Cote ${l.odds.toFixed(2)}, probabilité selon le marché ${(l.probability * 100).toFixed(1)} %${l.dropped ? ", cote en baisse" : ""}`),
      t.legs.map((_, i) => i + 1),
    ],
  );
}
