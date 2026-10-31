import { settleLeg, ticketStatus, type LegResult } from "../../src/lib/combos/settle.ts";
import type { MarketKey } from "../../src/lib/combos/markets.ts";
import type { Db } from "./db.ts";

/** Definitive settlement: legs from final scores (void when postponed/cancelled), then tickets whose legs are all decided. */
export async function settleTickets(db: Db, now: Date): Promise<{ legs: number; tickets: number }> {
  const { rows } = await db.query<{ id: string; market_key: string; selection_key: string; status: string; home_score: number | null; away_score: number | null }>(
    `select s.id::text as id, s.market_key, s.selection_key, m.status, m.home_score, m.away_score
     from public.ticket_selections s join public.matches m on m.id = s.match_id
     join public.tickets t on t.id = s.ticket_id
     where t.match_day is not null and s.result is null and m.status in ('finished', 'postponed', 'cancelled')`,
  );
  let legs = 0;
  for (const r of rows) {
    const result = settleLeg(r.market_key as MarketKey, r.selection_key, r.home_score, r.away_score, r.status === "finished" ? "finished" : "void");
    if (result === "pending") continue;
    await db.query("update public.ticket_selections set result = $2 where id = $1", [r.id, result]);
    legs++;
  }

  const open = (
    await db.query<{ id: string; results: (string | null)[] }>(
      `select t.id::text as id, array_agg(s.result order by s.position) as results
       from public.tickets t join public.ticket_selections s on s.ticket_id = t.id
       where t.match_day is not null and t.status = 'active' group by t.id
       having count(s.result) = count(*)`,
    )
    // Filtered in SQL: postgres.js reads nulls inside text[] as the string "NULL".
  ).rows;
  for (const t of open) {
    await db.query("update public.tickets set result = $2, status = 'settled', settled_at = $3 where id = $1", [
      t.id, ticketStatus(t.results as LegResult[]), now.toISOString(),
    ]);
  }
  return { legs, tickets: open.length };
}
