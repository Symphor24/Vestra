import type { Match, Outcome, TicketCategory } from "./types.ts";

export const matchLabel = (m: Match) => `${m.home.name} – ${m.away.name}`;

export function outcomeLabel(m: Pick<Match, "home" | "away">, o: Outcome) {
  if (o === "draw") return "Match nul";
  return `Victoire ${o === "home" ? m.home.shortName : m.away.shortName}`;
}

export const outcomeCode: Record<Outcome, string> = { home: "1", draw: "N", away: "2" };

export const MARKET_LABEL = "Résultat du match (1N2)";

export const categoryLabel: Record<TicketCategory, string> = {
  moderate: "Cote modérée",
  intermediate: "Intermédiaire",
  high: "Cote élevée",
};

export const categoryTarget: Record<TicketCategory, string> = {
  moderate: "Objectif 2 à 5",
  intermediate: "Objectif 10 à 50",
  high: "Objectif 100 et plus",
};

export const fmtOdds = (o: number) => o.toFixed(2);

export const fmtPct = (p: number, digits = 1) => `${p.toFixed(digits).replace(".", ",")} %`;

export function fmtSignedPct(p: number) {
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(1).replace(".", ",")} %`;
}

/** Combined odds can get large: keep 2 decimals below 100, round above. */
export const fmtTotal = (o: number) =>
  o < 100 ? o.toFixed(2) : Math.round(o).toLocaleString("fr-FR");
