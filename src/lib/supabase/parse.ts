import { z } from "zod";
import { MARKET_PICKS, pickLabel, type MarketKey } from "../combos/markets.ts";
import type { MatchState } from "../combos/settle.ts";
import { TIERS } from "../combos/tiers.ts";
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
const team = z.object({ id: z.string(), name: z.string(), shortName: z.string() });
// Optional: the app may deploy before the migration that adds them.
const matchTeam = team.extend({ fdId: z.string().nullable().optional(), crest: z.string().nullable().optional() });
const point = z.object({ observedAt: ts, odds });

const MatchRow = z.object({
  id: z.string(),
  competition: z.object({ id: z.string(), name: z.string(), country: z.string() }),
  home: matchTeam,
  away: matchTeam,
  footballDataId: z.string().nullable().optional(),
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

const tier = z.string().transform((c, ctx) => {
  const t = TIERS.find((x) => String(x) === c);
  if (t === undefined) ctx.addIssue({ code: "custom", message: `palier inconnu : ${c}` });
  return t ?? z.NEVER;
});
const market = z.enum(Object.keys(MARKET_PICKS) as [MarketKey, ...MarketKey[]]);
const result = z.enum(["won", "lost", "void"]).nullable();
// Raw matches.status → what settleLeg expects.
const MATCH_STATE: Record<string, MatchState> = { scheduled: "scheduled", live: "live", finished: "finished", postponed: "void", cancelled: "void" };
const matchState = z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).transform((s) => MATCH_STATE[s]);

const TicketRow = z.object({
  id: z.string(),
  category: tier,
  totalOdds: odds,
  probability: z.number().nullable(),
  featured: z.boolean(),
  result,
  matchDay: z.string().nullable(),
  generatedAt: ts,
  methodologyVersion: z.string(),
  legs: z
    .array(
      z.object({
        matchId: z.string(),
        market,
        outcome: z.string(),
        odds,
        observedAt: ts,
        rationale: z.string(),
        result,
        kickoffAt: ts,
        footballDataId: z.string().nullable(),
        matchStatus: matchState,
        homeScore: z.number().int().nullable(),
        awayScore: z.number().int().nullable(),
        home: team.omit({ id: true }),
        away: team.omit({ id: true }),
      }),
    )
    .min(1),
});

export function parseMatches(json: unknown): Match[] {
  return z.array(MatchRow).parse(json);
}

export function parseTickets(json: unknown): Ticket[] {
  // Legacy rows (risk-label categories) are skipped before strict parsing.
  const rows = (json as { category?: unknown }[]).filter((r) => (TIERS as readonly number[]).includes(Number(r.category)));
  return z.array(TicketRow).parse(rows).map(({ category, legs, ...t }) => ({
    ...t,
    tier: category,
    legs: legs.map(({ home, away, matchStatus, ...l }) => ({
      ...l,
      matchState: matchStatus,
      label: pickLabel(l.market, l.outcome, home.shortName, away.shortName),
      matchLabel: `${home.name} – ${away.name}`,
    })),
  }));
}
