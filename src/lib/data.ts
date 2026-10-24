import { cacheLife } from "next/cache";
import { CATEGORIES, eligibleCandidates, generateTickets } from "@/lib/combos/generate";
import { buildDemoMatches, DEMO_COMPETITIONS } from "@/lib/demo/data";
import { selectionSignal } from "@/lib/odds/calc";
import { parseMatches, parseTickets } from "@/lib/supabase/parse";
import { OUTCOMES, type Competition, type DataSource, type Match, type Ticket } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Live as soon as Supabase is configured; otherwise demo data, flagged on every page. */
export const DATA_SOURCE: DataSource = SUPABASE_URL && SUPABASE_ANON_KEY ? "live" : "demo";

const RISK = Object.keys(CATEGORIES); // moderate → intermediate → high

/** A movement worth listing on the dashboard (descriptive, not a recommendation). */
export const MOVEMENT_THRESHOLD_PCT = 5;

interface Snapshot {
  source: DataSource;
  now: string;
  matches: Match[];
  tickets: Ticket[];
  competitions: Competition[];
}

/** PostgREST with the anon key: read-only, RLS applies. */
async function rest(path: string, body?: object): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} sur ${path}`);
  return res.json();
}

/** Server-cached for a few minutes: page views never hit the database or the providers directly. */
async function snapshot(): Promise<Snapshot> {
  "use cache";
  cacheLife("minutes");
  const now = new Date().toISOString();
  if (DATA_SOURCE === "demo") {
    const matches = buildDemoMatches(Date.parse(now));
    return { source: "demo", now, matches, tickets: generateTickets(matches, new Date(now)), competitions: DEMO_COMPETITIONS };
  }
  const [matches, tickets, competitions] = await Promise.all([
    rest("rpc/ui_matches", { p_now: now }).then(parseMatches),
    rest("rpc/ui_tickets", { p_now: now }).then((j) => parseTickets(j).sort((a, b) => RISK.indexOf(a.category) - RISK.indexOf(b.category))),
    rest("competitions?select=id,name,country&order=id").then((rows) =>
      (rows as { id: number; name: string; country: string }[]).map((c) => ({ ...c, id: String(c.id) })),
    ),
  ]);
  return { source: "live", now, matches, tickets, competitions };
}

export async function getMatches() {
  return snapshot();
}

export async function getMatch(id: string) {
  const s = await snapshot();
  return { ...s, match: s.matches.find((m) => m.id === id) ?? null };
}

export const getCompetitions = async () => (await snapshot()).competitions;

export async function getDashboard() {
  const s = await snapshot();
  const now = new Date(s.now);
  const movements = s.matches.flatMap((m) =>
    m.status === "scheduled"
      ? OUTCOMES.filter((o) => Math.abs(selectionSignal(m.h2h[o], now).changePct ?? 0) >= MOVEMENT_THRESHOLD_PCT)
      : [],
  ).length;
  const lastSync = s.matches.reduce<string | null>(
    (acc, m) => (!acc || m.lastSyncedAt > acc ? m.lastSyncedAt : acc),
    null,
  );
  return {
    ...s,
    stats: { analysed: s.matches.filter((m) => m.status === "scheduled").length, movements, lastSync },
    picks: eligibleCandidates(s.matches, now),
  };
}

export async function getTickets() {
  return snapshot();
}
