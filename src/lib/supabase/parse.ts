import { z } from "zod";
import { matchLabel, outcomeLabel } from "../formatting.ts";
import type { Match, Ticket } from "../types.ts";

// Validates what ui_matches / ui_tickets return before it reaches the UI.
// Timestamps arrive as "…+00:00"; they are normalised to toISOString() so string comparisons stay valid.
const ts = z.string().transform((s, ctx) => {
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    ctx.addIssue({ code: "custom", message: `date invalide : ${s}` });
    return z.NEVER;
  }
  return new Date(t).toISOString();
});
const odds = z.number().gt(1);
const outcome = z.enum(["home", "draw", "away"]);
const team = z.object({ id: z.string(), name: z.string(), shortName: z.string() });
const point = z.object({ observedAt: ts, odds });

const MatchRow = z.object({
  id: z.string(),
  competition: z.object({ id: z.string(), name: z.string(), country: z.string() }),
  home: team,
  away: team,
  kickoffAt: ts,
  status: z.enum(["scheduled", "finished"]),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  lastSyncedAt: ts,
  bookmaker: z.string(),
  confirmedAt: ts.nullable(),
  consensus: z.object({ home: odds, draw: odds, away: odds }).partial(),
  h2h: z.object({ home: z.array(point), draw: z.array(point), away: z.array(point) }),
});

const TicketRow = z.object({
  id: z.string(),
  category: z.enum(["moderate", "intermediate", "high"]),
  totalOdds: odds,
  generatedAt: ts,
  methodologyVersion: z.string(),
  legs: z
    .array(
      z.object({
        matchId: z.string(),
        outcome,
        odds,
        observedAt: ts,
        rationale: z.string(),
        home: team.omit({ id: true }),
        away: team.omit({ id: true }),
      }),
    )
    .min(2),
});

export function parseMatches(json: unknown): Match[] {
  return z.array(MatchRow).parse(json);
}

export function parseTickets(json: unknown): Ticket[] {
  return z.array(TicketRow).parse(json).map(({ legs, ...t }) => ({
    ...t,
    legs: legs.map(({ home, away, ...l }) => ({
      ...l,
      label: outcomeLabel({ home: { ...home, id: "" }, away: { ...away, id: "" } }, l.outcome),
      matchLabel: matchLabel({ home: { ...home, id: "" }, away: { ...away, id: "" } }),
    })),
  }));
}
