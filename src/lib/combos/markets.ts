// Relative .ts imports: this module is shared with the Node scripts (no path aliases there).
import { normalizedProbabilities } from "../odds/calc.ts";

export type MarketKey = "h2h" | "double_chance" | "totals_1.5" | "totals_2.5" | "totals_3.5" | "btts";

export const MARKET_PICKS: Record<MarketKey, readonly string[]> = {
  h2h: ["home", "draw", "away"],
  double_chance: ["1X", "12", "X2"],
  "totals_1.5": ["over", "under"],
  "totals_2.5": ["over", "under"],
  "totals_3.5": ["over", "under"],
  btts: ["yes", "no"],
};

/** Margin-free probability per pick; null when an outcome is missing or has odds ≤ 1. */
export function marketProbabilities(market: MarketKey, prices: Record<string, number>): Record<string, number> | null {
  const picks = MARKET_PICKS[market];
  const probs = normalizedProbabilities(picks.map((p) => prices[p]));
  if (!probs) return null;
  // Each double-chance pick covers two of three results, so the market sums to 2.
  const factor = market === "double_chance" ? 2 : 1;
  return Object.fromEntries(picks.map((p, i) => [p, probs[i] * factor]));
}

export function pickLabel(market: MarketKey, pick: string, home: string, away: string): string {
  if (market === "h2h") return pick === "home" ? `Victoire ${home}` : pick === "away" ? `Victoire ${away}` : "Match nul";
  if (market === "double_chance") {
    return pick === "1X" ? `Double chance ${home} ou nul` : pick === "12" ? `Double chance ${home} ou ${away}` : `Double chance nul ou ${away}`;
  }
  if (market === "btts") return `Les deux équipes marquent : ${pick === "yes" ? "oui" : "non"}`;
  const line = market.slice("totals_".length).replace(".", ",");
  return `${pick === "over" ? "Plus" : "Moins"} de ${line} buts`;
}
