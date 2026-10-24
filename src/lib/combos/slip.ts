import { normalizedProbabilities, selectionSignal, totalOdds } from "../odds/calc.ts";
import { fmtOdds, fmtTotal, MARKET_LABEL } from "../formatting.ts";
import { OUTCOMES, type Leg, type Match } from "../types.ts";

export interface SlipReview {
  count: number;
  total: number | null;
  /** Match ids that appear in more than one leg: those outcomes are mutually exclusive. */
  conflicts: Set<string>;
  /** Legs from different matches that share a team: their outcomes are correlated. */
  correlated: Set<number>;
  /** Legs whose latest price is stale or whose match is no longer known/open. */
  stale: Set<number>;
  /** Index → latest known odds, for legs whose price moved since it was added. */
  moved: Map<number, number>;
  /** Market probability if the legs were independent; null whenever that can't be stated. */
  probabilityIfIndependent: number | null;
}

export function reviewSlip(legs: Leg[], matches: Map<string, Match>, now: Date): SlipReview {
  const seen = new Map<string, number>();
  legs.forEach((l) => seen.set(l.matchId, (seen.get(l.matchId) ?? 0) + 1));
  const conflicts = new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));

  const stale = new Set<number>();
  const moved = new Map<number, number>();
  const probs: (number | null)[] = [];
  legs.forEach((leg, i) => {
    const m = matches.get(leg.matchId);
    if (!m || m.status !== "scheduled") {
      stale.add(i);
      probs.push(null);
      return;
    }
    const s = selectionSignal(m.h2h[leg.outcome], now, m.confirmedAt);
    if (s.stale) stale.add(i);
    if (s.current && s.current.odds !== leg.odds) moved.set(i, s.current.odds);
    const market = normalizedProbabilities(OUTCOMES.map((o) => m.h2h[o].at(-1)?.odds ?? NaN));
    probs.push(market?.[OUTCOMES.indexOf(leg.outcome)] ?? null);
  });

  const correlated = new Set<number>();
  legs.forEach((a, i) =>
    legs.forEach((b, j) => {
      const ma = matches.get(a.matchId);
      const mb = matches.get(b.matchId);
      if (i === j || !ma || !mb || ma.id === mb.id) return;
      if ([ma.home.id, ma.away.id].some((t) => t === mb.home.id || t === mb.away.id)) correlated.add(i);
    }),
  );

  const canEstimate = legs.length >= 2 && conflicts.size === 0 && correlated.size === 0 && probs.every((p) => p !== null);
  return {
    count: legs.length,
    total: totalOdds(legs.map((l) => l.odds)),
    conflicts,
    correlated,
    stale,
    moved,
    probabilityIfIndependent: canEstimate ? probs.reduce<number>((a, p) => a * p!, 1) : null,
  };
}

export function ticketText(legs: Leg[], total: number | null) {
  const lines = legs.map(
    (l, i) => `${i + 1}. ${l.matchLabel}\n   ${MARKET_LABEL} : ${l.label} @ ${fmtOdds(l.odds)}`,
  );
  return [
    "Ticket Vestra",
    ...lines,
    `Cote totale théorique : ${total ? fmtTotal(total) : "indisponible"}`,
    "Cotes indicatives, à vérifier chez le bookmaker. Aucun gain n'est garanti.",
  ].join("\n");
}
