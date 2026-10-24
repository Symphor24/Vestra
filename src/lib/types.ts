export type Outcome = "home" | "draw" | "away";
export const OUTCOMES: Outcome[] = ["home", "draw", "away"];

export type MatchStatus = "scheduled" | "live" | "finished";

export interface Team {
  id: string;
  name: string;
  shortName: string;
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
}

export type TicketCategory = "moderate" | "intermediate" | "high";

export interface Leg {
  matchId: string;
  outcome: Outcome;
  odds: number;
  observedAt: string;
  /** Snapshot of names so a saved slip stays readable without the match data. */
  label: string;
  matchLabel: string;
}

export interface Ticket {
  id: string;
  category: TicketCategory;
  legs: (Leg & { rationale: string })[];
  totalOdds: number;
  generatedAt: string;
  methodologyVersion: string;
}

export type DataSource = "demo" | "live";
