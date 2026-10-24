import { normalizedProbabilities, selectionSignal, totalOdds } from "../odds/calc.ts";
import { outcomeLabel, matchLabel } from "../formatting.ts";
import { OUTCOMES, type Match, type Outcome, type Ticket, type TicketCategory } from "../types.ts";

export const METHODOLOGY_VERSION = "0.2.0";

export const RULES = {
  /** Descriptive filter only: a shortening price is not evidence of value. */
  minDropPct: 10,
  minObservations: 2,
  /** Ignore matches kicking off too soon to be checked before placing. */
  minMinutesBeforeKickoff: 30,
  /** A drop this large over a few days is more likely a data error than a market move. */
  maxDropPct: 50,
  /** Reference price this far from the median of all bookmakers is treated as off-market. */
  maxConsensusDeviationPct: 8,
};

/** Relative gap between the reference price and the market median, in %; null when unknown. */
export function consensusDeviationPct(match: Match, outcome: Outcome, odds: number): number | null {
  const c = match.consensus?.[outcome];
  return c ? (Math.abs(odds - c) / c) * 100 : null;
}

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
  /** When the price was last confirmed (≥ observedAt). */
  checkedAt: string;
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
      const s = selectionSignal(match.h2h[outcome], now, match.confirmedAt);
      if (s.stale || s.observations < rules.minObservations || s.dropPct === null) continue;
      if (s.dropPct < rules.minDropPct || s.dropPct > rules.maxDropPct || !s.current || !s.first) continue;
      if ((consensusDeviationPct(match, outcome, s.current.odds) ?? 0) > rules.maxConsensusDeviationPct) continue;
      if (best && best.dropPct >= s.dropPct) continue;
      best = {
        match,
        outcome,
        odds: s.current.odds,
        firstOdds: s.first.odds,
        observedAt: s.current.observedAt,
        checkedAt: s.checkedAt!,
        dropPct: s.dropPct,
        observations: s.observations,
        marketProbability: probs?.[i] ?? null,
      };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.dropPct - a.dropPct || a.odds - b.odds || a.match.id.localeCompare(b.match.id));
}

const teamIds = (m: Match) => [m.home.id, m.away.id];

/**
 * Greedy, deterministic: walk candidates in order, skip any leg that would overshoot the target
 * or that shares a team with a leg already chosen (its outcomes would be correlated).
 */
export function buildLegs(candidates: Candidate[], category: TicketCategory): Candidate[] | null {
  const { min, max, maxLegs } = CATEGORIES[category];
  // The moderate ticket favours the shortest prices; the others follow signal strength.
  const ordered = category === "moderate" ? [...candidates].sort((a, b) => a.odds - b.odds) : candidates;
  const legs: Candidate[] = [];
  let product = 1;
  for (const c of ordered) {
    if (legs.length >= maxLegs || product >= min) break;
    if (product * c.odds > max) continue;
    if (legs.some((l) => teamIds(l.match).some((t) => teamIds(c.match).includes(t)))) continue;
    legs.push(c);
    product *= c.odds;
  }
  return legs.length >= 2 && product >= min ? legs : null;
}

export function rationale(c: Candidate): string {
  const base = `Cote passée de ${c.firstOdds.toFixed(2)} à ${c.odds.toFixed(2)} (−${c.dropPct.toFixed(1)} %) sur ${c.observations} observations Vestra chez le même bookmaker.`;
  const dev = consensusDeviationPct(c.match, c.outcome, c.odds);
  return dev === null ? base : `${base} Écart de ${dev.toFixed(1)} % avec la cote médiane du marché.`;
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
