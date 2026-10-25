// Relative .ts imports: this module is shared with the Node scripts (no path aliases there).
import type { MarketKey } from "./markets.ts";

export const TIERS = [2, 5, 10, 20, 50, 100, 500, 1000, 5000, 20000] as const;
export type Tier = (typeof TIERS)[number];

export const FEATURE_DROP_BONUS = 0.05;
export const FEATURE_THIRD_RATIO = 0.8;
const FEATURED_TIERS: readonly Tier[] = [2, 5, 10];
const TIE_RATIO = 0.99; // spec §3: probabilities less than 1 % apart count as equal
// Search granularity: states are grouped by log(total odds) in slots this wide, keeping the best few per slot.
const SLOT_WIDTH = 0.02;
const PER_SLOT = 4;

export interface Selection {
  matchId: string;
  teamIds: [string, string];
  kickoffAt: string;
  market: MarketKey;
  pick: string;
  odds: number;
  probability: number;
  observedAt: string;
  dropped: boolean;
  label: string;
  matchLabel: string;
}

export interface TierTicket {
  tier: Tier;
  legs: Selection[];
  totalOdds: number;
  probability: number;
  featured: boolean;
}

export function tierBand(t: Tier): [number, number] {
  return t === 20000 ? [17000, Infinity] : [0.85 * t, 1.15 * t];
}

// Legs are a parent-linked list so extending a state never copies an array.
interface State {
  leg: Selection | null;
  parent: State | null;
  count: number;
  odds: number;
  probability: number;
  contested: number; // bits of the team-sharing matches used
}

function usesMatch(st: State, matchIds: Set<string>): boolean {
  for (let n: State | null = st; n?.leg; n = n.parent) if (matchIds.has(n.leg.matchId)) return true;
  return false;
}

function legsOf(st: State): Selection[] {
  const legs: Selection[] = [];
  for (let n: State | null = st; n?.leg; n = n.parent) legs.unshift(n.leg);
  return legs;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Selections grouped by match, in a canonical order so the output never depends on input order. */
function canonicalMatches(selections: Selection[]): Selection[][] {
  // Odds ≤ 1 cannot be priced into a ticket (and would break the log-odds slots).
  const sorted = selections.filter((s) => s.odds > 1).sort(
    (a, b) => cmp(a.kickoffAt, b.kickoffAt) || cmp(a.matchId, b.matchId) || cmp(a.market, b.market) || cmp(a.pick, b.pick),
  );
  const groups: Selection[][] = [];
  for (const s of sorted) {
    const last = groups.at(-1);
    if (last && last[0].matchId === s.matchId) last.push(s);
    else groups.push([s]);
  }
  return groups;
}

/**
 * Most probable accumulator per tier, from one shared search: a cell's content only depends on the
 * cells below it, so searching every tier at once gives each tier the same result as its own search.
 */
function searchTiers(selections: Selection[], tiers: readonly Tier[]): Map<Tier, Selection[]> {
  const matches = canonicalMatches(selections);
  // Per tier: best finished ticket per leg count, so the 1 % tie rule can be applied at the end.
  const bands = tiers.map((t) => ({ tier: t, band: tierBand(t), byLegs: new Map<number, State>() }));
  const maxHi = Math.max(...bands.map((b) => b.band[1]));
  // A state at 17 000+ can only serve the open tier, where another leg never helps: no slot past it.
  const cap = Math.min(maxHi, 17000);
  const slots = Math.ceil(Math.log(cap) / SLOT_WIDTH) + 1;

  // Earlier matches sharing a team with each match (rare: only then do states need a team check).
  const teamMatches = new Map<string, number[]>();
  const conflicts = matches.map((m, mi) => {
    const ids = new Set<string>();
    for (const team of new Set(m.flatMap((s) => s.teamIds))) {
      const seen = teamMatches.get(team) ?? [];
      for (const other of seen) ids.add(matches[other][0].matchId);
      teamMatches.set(team, [...seen, mi]);
    }
    return ids.size ? ids : null;
  });
  // States that differ in which team-sharing match they use are not comparable, so each such match gets
  // a bit in the state's cell key. shortcut: past 30 such matches bits are shared (search less exact),
  // never seen in practice since a team plays once a day.
  const contestedBit = new Array<number>(matches.length).fill(0);
  let nextBit = 0;
  for (const ids of teamMatches.values()) {
    if (ids.length < 2) continue;
    for (const mi of ids) if (!contestedBit[mi]) contestedBit[mi] = 1 << (nextBit++ % 30);
  }

  const record = (st: State) => {
    const hit = bands.find(({ band: [lo, hi] }) => st.odds >= lo && st.odds <= hi);
    if (!hit) return;
    const prev = hit.byLegs.get(st.count);
    if (!prev || st.probability > prev.probability) hit.byLegs.set(st.count, st);
  };

  let states: State[] = [{ leg: null, parent: null, count: 0, odds: 1, probability: 1, contested: 0 }];
  matches.forEach((match, mi) => {
    // Each cell (odds slot, team-sharing matches used) keeps its PER_SLOT most probable states, sorted
    // desc; ties keep the first (canonical) one.
    const tables = new Map<number, State[][]>();
    const offer = (st: State) => {
      let table = tables.get(st.contested);
      if (!table) tables.set(st.contested, (table = Array.from({ length: slots }, () => [])));
      const cell = table[Math.min(slots - 1, Math.floor(Math.log(st.odds) / SLOT_WIDTH))];
      let i = cell.length;
      while (i > 0 && cell[i - 1].probability < st.probability) i--;
      if (i < PER_SLOT) {
        cell.splice(i, 0, st);
        if (cell.length > PER_SLOT) cell.pop();
      }
    };
    for (const st of states) {
      offer(st); // skip this match
      if (conflicts[mi] && usesMatch(st, conflicts[mi])) continue;
      for (const s of match) {
        const odds = st.odds * s.odds;
        if (odds > maxHi) continue;
        const child = {
          leg: s,
          parent: st,
          count: st.count + 1,
          odds,
          probability: st.probability * s.probability,
          contested: st.contested | contestedBit[mi],
        };
        if (child.count >= 2) record(child);
        if (odds < cap) offer(child);
      }
    }
    states = [...tables.values()].flat(2);
  });

  const result = new Map<Tier, Selection[]>();
  for (const { tier, byLegs } of bands) {
    if (byLegs.size === 0) continue;
    const max = Math.max(...[...byLegs.values()].map((s) => s.probability));
    const fewest = Math.min(...[...byLegs].filter(([, s]) => s.probability >= max * TIE_RATIO).map(([n]) => n));
    result.set(tier, legsOf(byLegs.get(fewest)!));
  }
  return result;
}

/** Most probable accumulator whose total odds fall in the tier's band, or null if none exists. */
export function buildTier(selections: Selection[], tier: Tier): Selection[] | null {
  return searchTiers(selections, [tier]).get(tier) ?? null;
}

export function generateDay(selections: Selection[]): TierTicket[] {
  const found = searchTiers(selections, TIERS);
  const tickets: TierTicket[] = [];
  for (const [tier, legs] of found) {
    tickets.push({
      tier,
      legs,
      totalOdds: legs.reduce((p, l) => p * l.odds, 1),
      probability: legs.reduce((p, l) => p * l.probability, 1),
      featured: false,
    });
  }

  const ranked = tickets
    .filter((t) => FEATURED_TIERS.includes(t.tier))
    .map((t) => ({ t, score: t.probability * (1 + FEATURE_DROP_BONUS * t.legs.filter((l) => l.dropped).length) }))
    .sort((a, b) => b.score - a.score);
  ranked.forEach(({ t, score }, i) => {
    t.featured = i < 2 || (i === 2 && score >= FEATURE_THIRD_RATIO * ranked[1].score);
  });
  return tickets;
}
