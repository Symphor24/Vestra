import type { LegResult, MatchState } from "./combos/settle.ts";
import type { MarketKey } from "./combos/markets.ts";
import type { Tier } from "./combos/tiers.ts";

export type Outcome = "home" | "draw" | "away";
export const OUTCOMES: Outcome[] = ["home", "draw", "away"];

export type MatchStatus = "scheduled" | "live" | "finished";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** football-data.org team id, once learned (live data only). */
  fdId?: string | null;
  /** Club crest URL from football-data.org (live data only). */
  crest?: string | null;
}

export interface Competition {
  id: string;
  name: string;
  country: string;
}

/** One observed price, as recorded by Vestra. The first one is NOT an opening price. */
export interface OddsPoint {
  observedAt: string;
  odds: number;
}

export interface Match {
  id: string;
  competition: Competition;
  home: Team;
  away: Team;
  kickoffAt: string;
  status: MatchStatus;
  lastSyncedAt: string;
  /** All observations of a match come from this single bookmaker, so they stay comparable. */
  bookmaker: string;
  /** Chronological observations of the 1X2 market. */
  h2h: Record<Outcome, OddsPoint[]>;
  /** Full-time score, once the result is known. */
  homeScore?: number | null;
  awayScore?: number | null;
  /** Last sync where the reference bookmaker still offered these prices (live data only). */
  confirmedAt?: string | null;
  /** Median latest price across all bookmakers, to spot an off-market reference price (live data only). */
  consensus?: Partial<Record<Outcome, number>>;
  /** football-data.org match id, linked about two days before kickoff (live data only). */
  footballDataId?: string | null;
}

export interface Leg {
  matchId: string;
  market: MarketKey;
  /** A 1X2 outcome for "h2h", otherwise the pick of the market (over, yes, 1X…). */
  outcome: string;
  odds: number;
  observedAt: string;
  /** Snapshot of names so a saved slip stays readable without the match data. */
  label: string;
  matchLabel: string;
}

export interface Ticket {
  id: string;
  tier: Tier;
  legs: (Leg & {
    rationale: string;
    result: LegResult | null;
    kickoffAt: string;
    /** Null for demo data and matches the provider does not cover. */
    footballDataId: string | null;
    matchState: MatchState;
    homeScore: number | null;
    awayScore: number | null;
  })[];
  totalOdds: number;
  probability: number | null;
  featured: boolean;
  result: LegResult | null;
  matchDay: string | null;
  generatedAt: string;
  methodologyVersion: string;
}

export type DataSource = "demo" | "live";
