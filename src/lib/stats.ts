// Relative .ts imports: this module is shared with the Node scripts (no path aliases there).
import type { MarketKey } from "./combos/markets.ts";

/** A finished match of the season, by football-data team id. */
export interface Result {
  utcDate: string;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
}

/** What football-data.org sends for a match, as far as statistics need it. */
interface FdLike {
  utcDate: string;
  status: string;
  homeTeam: { id: number | null };
  awayTeam: { id: number | null };
  score: { fullTime: { home: number | null; away: number | null } };
}

export function toResults(matches: FdLike[]): Result[] {
  return matches
    .filter((m) => m.status === "FINISHED" && m.homeTeam.id !== null && m.awayTeam.id !== null && m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .map((m) => ({ utcDate: m.utcDate, homeId: m.homeTeam.id!, awayId: m.awayTeam.id!, homeGoals: m.score.fullTime.home!, awayGoals: m.score.fullTime.away! }))
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

export interface TeamForm {
  played: number;
  /** Most recent last, "W" | "D" | "L". */
  last5: ("W" | "D" | "L")[];
  goalsFor: number;
  goalsAgainst: number;
  bttsPct: number;
  over25Pct: number;
  cleanSheetPct: number;
}

/** Per-match averages over the season; null before the team has played. */
export function teamForm(results: Result[], teamId: number): TeamForm | null {
  const games = results
    .filter((r) => r.homeId === teamId || r.awayId === teamId)
    .map((r) => (r.homeId === teamId ? { gf: r.homeGoals, ga: r.awayGoals } : { gf: r.awayGoals, ga: r.homeGoals }));
  const n = games.length;
  if (!n) return null;
  const pct = (f: (g: { gf: number; ga: number }) => boolean) => (games.filter(f).length / n) * 100;
  return {
    played: n,
    last5: games.slice(-5).map((g) => (g.gf > g.ga ? "W" : g.gf < g.ga ? "L" : "D")),
    goalsFor: games.reduce((s, g) => s + g.gf, 0) / n,
    goalsAgainst: games.reduce((s, g) => s + g.ga, 0) / n,
    bttsPct: pct((g) => g.gf > 0 && g.ga > 0),
    over25Pct: pct((g) => g.gf + g.ga > 2),
    cleanSheetPct: pct((g) => g.ga === 0),
  };
}

/** Below this many games for either team, the model is not used. */
export const MIN_PLAYED = 4;
// Each team's rates are shrunk towards the league average as if it had played this many average games.
const PRIOR_GAMES = 3;

/**
 * Goals each side should score, from season attack/defence strengths (Maher-style Poisson model):
 * λ = league average at home (or away) × own attack × opponent's defence. Not an xG from shot data.
 */
export function expectedGoals(results: Result[], homeId: number, awayId: number): { home: number; away: number } | null {
  if (!results.length) return null;
  const avgHome = results.reduce((s, r) => s + r.homeGoals, 0) / results.length;
  const avgAway = results.reduce((s, r) => s + r.awayGoals, 0) / results.length;
  const mu = (avgHome + avgAway) / 2;
  const strength = (id: number) => {
    let gf = 0, ga = 0, n = 0;
    for (const r of results) {
      if (r.homeId === id) { gf += r.homeGoals; ga += r.awayGoals; n++; }
      else if (r.awayId === id) { gf += r.awayGoals; ga += r.homeGoals; n++; }
    }
    return { n, attack: (gf + PRIOR_GAMES * mu) / ((n + PRIOR_GAMES) * mu), defence: (ga + PRIOR_GAMES * mu) / ((n + PRIOR_GAMES) * mu) };
  };
  const h = strength(homeId), a = strength(awayId);
  if (h.n < MIN_PLAYED || a.n < MIN_PLAYED || mu === 0) return null;
  return { home: avgHome * h.attack * a.defence, away: avgAway * a.attack * h.defence };
}

const MAX_GOALS = 10;

/** Probability of every pick of every market, assuming independent Poisson scores. */
export function modelProbabilities(xg: { home: number; away: number }): Record<MarketKey, Record<string, number>> {
  const pois = (l: number) => {
    const p = [Math.exp(-l)];
    for (let k = 1; k <= MAX_GOALS; k++) p.push((p[k - 1] * l) / k);
    return p;
  };
  const ph = pois(xg.home), pa = pois(xg.away);
  let home = 0, draw = 0, away = 0, btts = 0, total = 0;
  const under = { 1.5: 0, 2.5: 0, 3.5: 0 };
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      total += p;
      if (i > j) home += p; else if (i < j) away += p; else draw += p;
      if (i > 0 && j > 0) btts += p;
      for (const line of [1.5, 2.5, 3.5] as const) if (i + j < line) under[line] += p;
    }
  }
  // The grid stops at 10 goals a side: renormalise the missing (negligible) tail.
  [home, draw, away, btts] = [home, draw, away, btts].map((x) => x / total);
  for (const line of [1.5, 2.5, 3.5] as const) under[line] /= total;
  return {
    h2h: { home, draw, away },
    double_chance: { "1X": home + draw, "12": home + away, X2: draw + away },
    "totals_1.5": { over: 1 - under[1.5], under: under[1.5] },
    "totals_2.5": { over: 1 - under[2.5], under: under[2.5] },
    "totals_3.5": { over: 1 - under[3.5], under: under[3.5] },
    btts: { yes: btts, no: 1 - btts },
  };
}

/** Share of the statistical model in a leg's probability; the market stays the main source. */
export const MODEL_WEIGHT = 0.25;

export function blend(market: number, model: number | undefined): number {
  return model === undefined ? market : (1 - MODEL_WEIGHT) * market + MODEL_WEIGHT * model;
}
