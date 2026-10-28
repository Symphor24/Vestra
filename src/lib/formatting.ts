import type { Tier } from "./combos/tiers.ts";
import type { Match, Outcome } from "./types.ts";

export const matchLabel = (m: Pick<Match, "home" | "away">) => `${m.home.name} – ${m.away.name}`;

export function outcomeLabel(m: Pick<Match, "home" | "away">, o: Outcome) {
  if (o === "draw") return "Match nul";
  return `Victoire ${o === "home" ? m.home.shortName : m.away.shortName}`;
}

export const outcomeCode: Record<Outcome, string> = { home: "1", draw: "N", away: "2" };

export const MARKET_LABEL = "Résultat du match (1N2)";

export const tierLabel = (t: Tier) => (t === 20000 ? "~20 000 et +" : `~${t.toLocaleString("fr-FR")}`);

export const fmtOdds = (o: number) => o.toFixed(2);

export const fmtPct = (p: number, digits = 1) => `${p.toFixed(digits).replace(".", ",")} %`;

export function fmtSignedPct(p: number) {
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(1).replace(".", ",")} %`;
}

/** Combined odds can get large: keep 2 decimals below 100, round above. */
export const fmtTotal = (o: number) =>
  o < 100 ? o.toFixed(2) : Math.round(o).toLocaleString("fr-FR");

const BOOKMAKERS: Record<string, string> = {
  pinnacle: "Pinnacle",
  betfair_ex_eu: "Betfair Exchange",
  unibet_eu: "Unibet",
  williamhill: "William Hill",
};
/** Display name for a provider bookmaker key; unknown keys are shown as sent. */
export const bookmakerName = (key: string) => BOOKMAKERS[key] ?? key;
