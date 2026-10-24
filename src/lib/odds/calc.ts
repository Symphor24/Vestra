// Relative .ts imports: this module is shared with the Node scripts (no path aliases there).
import type { OddsPoint } from "../types.ts";

/** Odds older than this are flagged as stale. Sync runs ~3×/day, so 12 h means "missed at least one sync". */
export const STALE_AFTER_HOURS = 12;

/** Decimal odds are only meaningful above 1. */
export const isValidOdds = (o: number) => Number.isFinite(o) && o > 1;

/** ((O1 - O0) / O0) × 100 */
export function relativeChange(o0: number, o1: number): number | null {
  return isValidOdds(o0) && isValidOdds(o1) ? ((o1 - o0) / o0) * 100 : null;
}

/** ((O0 - O1) / O0) × 100 — positive when the price shortened. */
export function dropPercent(o0: number, o1: number): number | null {
  return isValidOdds(o0) && isValidOdds(o1) ? ((o0 - o1) / o0) * 100 : null;
}

/** Raw implied probability 1/O. Includes the bookmaker margin, so it is not the true probability. */
export function impliedProbability(o: number): number | null {
  return isValidOdds(o) ? 1 / o : null;
}

/** Bookmaker margin (overround) of a complete market: Σ(1/O) − 1. */
export function marketMargin(odds: number[]): number | null {
  if (odds.length < 2 || !odds.every(isValidOdds)) return null;
  return odds.reduce((s, o) => s + 1 / o, 0) - 1;
}

/** Proportional normalisation: removes the margin by scaling 1/O so the market sums to 1. */
export function normalizedProbabilities(odds: number[]): number[] | null {
  if (odds.length < 2 || !odds.every(isValidOdds)) return null;
  const sum = odds.reduce((s, o) => s + 1 / o, 0);
  return odds.map((o) => 1 / o / sum);
}

/** Theoretical combined odds for independent events: the product. */
export function totalOdds(odds: number[]): number | null {
  if (odds.length === 0 || !odds.every(isValidOdds)) return null;
  return odds.reduce((p, o) => p * o, 1);
}

export const ageHours = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / 3_600_000;

export interface SelectionSignal {
  /** First price Vestra observed, not the market opening price. */
  first: OddsPoint | null;
  current: OddsPoint | null;
  observations: number;
  changePct: number | null;
  dropPct: number | null;
  /** Latest moment the price is known to be valid: its last change, or a later sync that confirmed it. */
  checkedAt: string | null;
  ageHours: number | null;
  stale: boolean;
}

/**
 * Providers timestamp a price when it last *changed*; an unchanged price confirmed by a recent sync
 * is still fresh, hence `confirmedAt`.
 */
export function selectionSignal(history: OddsPoint[], now: Date, confirmedAt?: string | null): SelectionSignal {
  const valid = history.filter((p) => isValidOdds(p.odds));
  const first = valid[0] ?? null;
  const current = valid.at(-1) ?? null;
  const comparable = valid.length >= 2 && first !== null && current !== null;
  const checkedAt =
    current && confirmedAt && Date.parse(confirmedAt) > Date.parse(current.observedAt) ? confirmedAt : (current?.observedAt ?? null);
  const age = checkedAt ? ageHours(checkedAt, now) : null;
  return {
    first,
    current,
    observations: valid.length,
    changePct: comparable ? relativeChange(first.odds, current.odds) : null,
    dropPct: comparable ? dropPercent(first.odds, current.odds) : null,
    checkedAt,
    ageHours: age,
    stale: age === null || age > STALE_AFTER_HOURS,
  };
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
