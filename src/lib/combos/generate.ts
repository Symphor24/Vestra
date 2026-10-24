import { normalizedProbabilities, selectionSignal, totalOdds } from "@/lib/odds/calc";
import { outcomeLabel, matchLabel } from "@/lib/formatting";
import { OUTCOMES, type Match, type Outcome, type Ticket, type TicketCategory } from "@/lib/types";

export const METHODOLOGY_VERSION = "0.1.0";

export const RULES = {
  /** Descriptive filter only: a shortening price is not evidence of value. */
  minDropPct: 10,
  minObservations: 2,
  /** Ignore matches kicking off too soon to be checked before placing. */
  minMinutesBeforeKickoff: 30,
};

/** Build targets, not promises: a category is left empty rather than padded. */
export const CATEGORIES: Record<TicketCategory, { min: number; max: number; maxLegs: number }> = {
  moderate: { min: 2, max: 5, maxLegs: 3 },
  intermediate: { min: 10, max: 50, maxLegs: 6 },
  high: { min: 100, max: Infinity, maxLegs: 8 },
};

export interface Candidate {
  match: Match;
  outcome: Outcome;
  odds: number;
  firstOdds: number;
  observedAt: string;
  dropPct: number;
  observations: number;
  /** Margin-free market probability, or null when the full market is not available. */
  marketProbability: number | null;
}

/** One candidate per match at most (its strongest shortening), so two legs never come from the same match. */
export function eligibleCandidates(matches: Match[], now: Date, rules = RULES): Candidate[] {
  const out: Candidate[] = [];
  for (const match of matches) {
    if (match.status !== "scheduled") continue;
    if (Date.parse(match.kickoffAt) - now.getTime() < rules.minMinutesBeforeKickoff * 60_000) continue;
    const current = OUTCOMES.map((o) => match.h2h[o].at(-1)?.odds ?? NaN);
    const probs = normalizedProbabilities(current);
    let best: Candidate | null = null;
    for (const [i, outcome] of OUTCOMES.entries()) {
      const s = selectionSignal(match.h2h[outcome], now);
      if (s.stale || s.observations < rules.minObservations || s.dropPct === null) continue;
      if (s.dropPct < rules.minDropPct || !s.current || !s.first) continue;
      if (best && best.dropPct >= s.dropPct) continue;
      best = {
        match,
        outcome,
        odds: s.current.odds,
        firstOdds: s.first.odds,
        observedAt: s.current.observedAt,
        dropPct: s.dropPct,
        observations: s.observations,
        marketProbability: probs?.[i] ?? null,
      };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.dropPct - a.dropPct || a.odds - b.odds || a.match.id.localeCompare(b.match.id));
}

/** Greedy, deterministic: walk candidates in order, skip any leg that would overshoot the target. */
export function buildLegs(candidates: Candidate[], category: TicketCategory): Candidate[] | null {
  const { min, max, maxLegs } = CATEGORIES[category];
  // The moderate ticket favours the shortest prices; the others follow signal strength.
  const ordered = category === "moderate" ? [...candidates].sort((a, b) => a.odds - b.odds) : candidates;
  const legs: Candidate[] = [];
  let product = 1;
  for (const c of ordered) {
    if (legs.length >= maxLegs || product >= min) break;
    if (product * c.odds > max) continue;
    legs.push(c);
    product *= c.odds;
  }
  return legs.length >= 2 && product >= min ? legs : null;
}

export function rationale(c: Candidate): string {
  return `Cote passée de ${c.firstOdds.toFixed(2)} à ${c.odds.toFixed(2)} (−${c.dropPct.toFixed(1)} %) sur ${c.observations} observations Vestra chez le même bookmaker.`;
}

export function generateTickets(matches: Match[], now: Date): Ticket[] {
  const candidates = eligibleCandidates(matches, now);
  const tickets: Ticket[] = [];
  for (const category of Object.keys(CATEGORIES) as TicketCategory[]) {
    const legs = buildLegs(candidates, category);
    if (!legs) continue;
    tickets.push({
      id: `${category}-${now.toISOString()}`,
      category,
      legs: legs.map((c) => ({
        matchId: c.match.id,
        outcome: c.outcome,
        odds: c.odds,
        observedAt: c.observedAt,
        label: outcomeLabel(c.match, c.outcome),
        matchLabel: matchLabel(c.match),
        rationale: rationale(c),
      })),
      totalOdds: totalOdds(legs.map((l) => l.odds))!,
      generatedAt: now.toISOString(),
      methodologyVersion: METHODOLOGY_VERSION,
    });
  }
  return tickets;
}
