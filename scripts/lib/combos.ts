import { generateTickets } from "../../src/lib/combos/generate.ts";
import { categoryLabel } from "../../src/lib/formatting.ts";
import type { Ticket } from "../../src/lib/types.ts";
import type { Db } from "./db.ts";
import { loadMatches } from "./matches.ts";

export interface CombosResult {
  created: number;
  kept: number;
  invalidated: number;
  expired: number;
}

const signature = (category: string, legs: { matchId: string; outcome: string; odds: number }[]) =>
  `${category}|${legs.map((l) => `${l.matchId}:${l.outcome}:${l.odds.toFixed(3)}`).sort().join(",")}`;

/**
 * Regenerates tickets from current data. An active ticket identical to a new one is kept as is;
 * any other active ticket is invalidated (its data changed); tickets whose first match started expire.
 */
export async function generateCombos(db: Db, now: Date): Promise<CombosResult> {
  const matches = await loadMatches(db, now);
  const kickoff = new Map(matches.map((m) => [m.id, m.kickoffAt]));
  const fresh = generateTickets(matches, now);

  const expired = (
    await db.query("update public.tickets set status = 'expired' where status = 'active' and expires_at <= $1 returning 1", [now.toISOString()])
  ).rows.length;

  const legs = (
    await db.query<{ id: string; category: string; match_id: string; selection_key: string; odds: number }>(
      `select t.id::text as id, t.category, s.match_id::text as match_id, s.selection_key, s.odds_at_generation::float8 as odds
       from public.tickets t join public.ticket_selections s on s.ticket_id = t.id
       where t.status = 'active'`,
    )
  ).rows;
  const active = new Map<string, string>(); // signature → ticket id
  for (const id of new Set(legs.map((l) => l.id))) {
    const own = legs.filter((l) => l.id === id);
    active.set(signature(own[0].category, own.map((l) => ({ matchId: l.match_id, outcome: l.selection_key, odds: l.odds }))), id);
  }

  const keep = new Set<string>();
  let created = 0;
  for (const t of fresh) {
    const existing = active.get(signature(t.category, t.legs));
    if (existing) {
      keep.add(existing);
      continue;
    }
    await insertTicket(db, t, kickoff);
    created++;
  }

  const stale = [...active.values()].filter((id) => !keep.has(id));
  if (stale.length)
    await db.query("update public.tickets set status = 'invalidated' where id = any($1::uuid[])", [stale]);
  return { created, kept: keep.size, invalidated: stale.length, expired };
}

/** One statement, so a ticket is never stored without its selections. */
async function insertTicket(db: Db, t: Ticket, kickoff: Map<string, string>) {
  const expiresAt = t.legs.map((l) => kickoff.get(l.matchId)!).sort()[0];
  await db.query(
    `with t as (
       insert into public.tickets (title, category, total_odds, estimated_probability, generated_at, expires_at, methodology_version)
       values ($1, $2, $3, null, $4, $5, $6) returning id
     )
     insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, rationale, position)
     select t.id, x.m, 'h2h', x.s, x.o, x.at, x.r, x.p
     from t, unnest($7::bigint[], $8::text[], $9::numeric[], $10::timestamptz[], $11::text[], $12::int[]) as x(m, s, o, at, r, p)`,
    [
      `Combiné ${categoryLabel[t.category].toLowerCase()}`, t.category, t.totalOdds, t.generatedAt, expiresAt, t.methodologyVersion,
      t.legs.map((l) => l.matchId), t.legs.map((l) => l.outcome), t.legs.map((l) => l.odds),
      t.legs.map((l) => l.observedAt), t.legs.map((l) => l.rationale), t.legs.map((_, i) => i + 1),
    ],
  );
}
