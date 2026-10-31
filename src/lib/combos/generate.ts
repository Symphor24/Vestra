import { normalizedProbabilities, selectionSignal } from "../odds/calc.ts";
import { OUTCOMES, type Match, type Outcome } from "../types.ts";

export const METHODOLOGY_VERSION = "1.1.0";

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
