import type { MarketKey } from "./markets.ts";

export type LegResult = "pending" | "won" | "lost" | "void";
export type MatchState = "scheduled" | "live" | "finished" | "void";

/** Early settlement: a leg is decided as soon as the score makes the outcome certain, otherwise at full time. */
export function settleLeg(market: MarketKey, pick: string, home: number | null, away: number | null, state: MatchState): LegResult {
  if (state === "void") return "void";
  if (state === "scheduled" || home === null || away === null) return "pending";
  const finished = state === "finished";
  const total = home + away;
  // Outcome that only a final whistle can confirm.
  const atEnd = (win: boolean): LegResult => (finished ? (win ? "won" : "lost") : "pending");

  if (market === "h2h") return atEnd(pick === (home > away ? "home" : home < away ? "away" : "draw"));
  if (market === "double_chance") {
    const r = home > away ? "1" : home < away ? "2" : "X";
    return atEnd(pick.includes(r));
  }
  if (market === "btts") {
    const both = home > 0 && away > 0;
    if (both) return pick === "yes" ? "won" : "lost";
    return atEnd(pick === "no");
  }
  const over = total > Number(market.slice("totals_".length));
  if (over) return pick === "over" ? "won" : "lost";
  return atEnd(pick === "under");
}

export function ticketStatus(legs: LegResult[]): LegResult {
  if (legs.includes("lost")) return "lost";
  if (legs.includes("pending")) return "pending";
  return legs.includes("won") ? "won" : "void";
}
