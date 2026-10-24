import { cacheLife } from "next/cache";
import { eligibleCandidates, generateTickets } from "@/lib/combos/generate";
import { buildDemoMatches, DEMO_COMPETITIONS } from "@/lib/demo/data";
import { selectionSignal } from "@/lib/odds/calc";
import { OUTCOMES, type DataSource, type Match } from "@/lib/types";

// shortcut: demo source only until Supabase is wired (phase 3/6); keep this module the single data entry point.
export const DATA_SOURCE: DataSource = "demo";

/** A movement worth listing on the dashboard (descriptive, not a recommendation). */
export const MOVEMENT_THRESHOLD_PCT = 5;

interface Snapshot {
  source: DataSource;
  now: string;
  matches: Match[];
}

/** Server-cached so page views never trigger provider calls. */
async function snapshot(): Promise<Snapshot> {
  "use cache";
  cacheLife("minutes");
  const now = Date.now();
  return { source: DATA_SOURCE, now: new Date(now).toISOString(), matches: buildDemoMatches(now) };
}

export async function getMatches() {
  return snapshot();
}

export async function getMatch(id: string) {
  const s = await snapshot();
  return { ...s, match: s.matches.find((m) => m.id === id) ?? null };
}

export const getCompetitions = async () => DEMO_COMPETITIONS;

export async function getDashboard() {
  const s = await snapshot();
  const now = new Date(s.now);
  const movements = s.matches.flatMap((m) =>
    m.status === "scheduled"
      ? OUTCOMES.filter((o) => Math.abs(selectionSignal(m.h2h[o], now).changePct ?? 0) >= MOVEMENT_THRESHOLD_PCT)
      : [],
  ).length;
  const tickets = generateTickets(s.matches, now);
  const picks = eligibleCandidates(s.matches, now);
  const lastSync = s.matches.reduce<string | null>(
    (acc, m) => (!acc || m.lastSyncedAt > acc ? m.lastSyncedAt : acc),
    null,
  );
  return {
    ...s,
    stats: { analysed: s.matches.filter((m) => m.status === "scheduled").length, movements, lastSync },
    tickets,
    picks,
  };
}

export async function getTickets() {
  const s = await snapshot();
  return { ...s, tickets: generateTickets(s.matches, new Date(s.now)) };
}
