import { cacheLife } from "next/cache";
import { displayStatus, type TicketStatus } from "@/lib/combos/display";
import { eligibleCandidates, METHODOLOGY_VERSION } from "@/lib/combos/generate";
import { marketProbabilities, pickLabel } from "@/lib/combos/markets";
import { generateDay, type Selection } from "@/lib/combos/tiers";
import { getLiveBoard } from "@/lib/live";
import { buildDemoMatches, DEMO_COMPETITIONS } from "@/lib/demo/data";
import { selectionSignal } from "@/lib/odds/calc";
import { parseMatches, parseTickets } from "@/lib/supabase/parse";
import { matchLabel } from "@/lib/formatting";
import { OUTCOMES, type Competition, type DataSource, type Match, type Ticket } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Live as soon as Supabase is configured; otherwise demo data, flagged on every page. */
export const DATA_SOURCE: DataSource = SUPABASE_URL && SUPABASE_ANON_KEY ? "live" : "demo";

/** Demo tickets: the day's tiers built from the demo 1X2 prices only. */
function demoTickets(matches: Match[], now: Date): Ticket[] {
  const dropped = new Set(eligibleCandidates(matches, now).map((c) => `${c.match.id}:${c.outcome}`));
  const selections = matches.flatMap((m): Selection[] => {
    if (m.status !== "scheduled") return [];
    const prices = Object.fromEntries(OUTCOMES.map((o) => [o, m.h2h[o].at(-1)?.odds ?? NaN]));
    const probs = marketProbabilities("h2h", prices);
    if (!probs) return [];
    return OUTCOMES.map((o) => ({
      matchId: m.id,
      teamIds: [m.home.id, m.away.id],
      kickoffAt: m.kickoffAt,
      market: "h2h",
      pick: o,
      odds: prices[o],
      probability: probs[o],
      observedAt: m.h2h[o].at(-1)!.observedAt,
      dropped: dropped.has(`${m.id}:${o}`),
      label: pickLabel("h2h", o, m.home.shortName, m.away.shortName),
      matchLabel: matchLabel(m),
    }));
  });
  const byId = new Map(matches.map((m) => [m.id, m]));
  return generateDay(selections).map((t) => ({
    id: `${t.tier}-${now.toISOString()}`,
    tier: t.tier,
    legs: t.legs.map((l) => ({
      matchId: l.matchId, market: l.market, outcome: l.pick, odds: l.odds, observedAt: l.observedAt, label: l.label, matchLabel: l.matchLabel,
      rationale: l.dropped ? "Cote en baisse sur les observations Vestra." : "",
      result: null, kickoffAt: l.kickoffAt, footballDataId: null, matchState: byId.get(l.matchId)!.status === "scheduled" ? "scheduled" : "finished",
      homeScore: null, awayScore: null,
    })),
    totalOdds: t.totalOdds,
    probability: t.probability,
    featured: t.featured,
    result: null,
    matchDay: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    methodologyVersion: METHODOLOGY_VERSION,
  }));
}

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
    return { source: "demo", now, matches, tickets: demoTickets(matches, new Date(now)), competitions: DEMO_COMPETITIONS };
  }
  const [matches, tickets, competitions] = await Promise.all([
    rest("rpc/ui_matches", { p_now: now }).then(parseMatches),
    rest("rpc/ui_tickets", { p_now: now }).then((j) => parseTickets(j)),
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

export interface DisplayTicket extends Ticket, TicketStatus {}

/** Not cached with the snapshot: tickets (minutes) are combined with live scores (1 minute) on every call. */
export async function getTicketBoard(): Promise<{ source: DataSource; now: string; tickets: DisplayTicket[] }> {
  const [s, board] = await Promise.all([snapshot(), getLiveBoard()]);
  const liveById = new Map((board?.leagues ?? []).flatMap((l) => l.matches).map((m) => [m.id, m]));
  return { source: s.source, now: s.now, tickets: s.tickets.map((t) => ({ ...t, ...displayStatus(t, liveById) })) };
}
