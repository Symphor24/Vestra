import { cacheLife } from "next/cache";
import { z } from "zod";

// Live scores straight from football-data.org (server-side key, never sent to the browser).
// One call covers the 5 leagues; the cache keeps us far below the free plan's 10 calls/minute.

/** Same names as supabase/seed.sql, so a league reads the same on every screen. */
export const LEAGUES: Record<string, string> = {
  PL: "Premier League",
  PD: "LaLiga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
};

// shortcut: hand-picked most-followed clubs (football-data ids), revisit if users ask for another notion of "popular".
const POPULAR_TEAM_IDS = new Set([
  57, 61, 64, 65, 66, 73, // Arsenal, Chelsea, Liverpool, Man City, Man United, Tottenham
  78, 81, 86, // Atlético, Barça, Real Madrid
  98, 108, 109, 113, // Milan, Inter, Juventus, Napoli
  4, 5, // Dortmund, Bayern
  516, 524, // Marseille, PSG
]);

export type LiveState = "live" | "paused" | "scheduled" | "finished" | "off";

const STATE: Record<string, LiveState> = {
  IN_PLAY: "live",
  PAUSED: "paused",
  TIMED: "scheduled",
  SCHEDULED: "scheduled",
  FINISHED: "finished",
  AWARDED: "finished",
  POSTPONED: "off",
  SUSPENDED: "off",
  CANCELLED: "off",
};

const fdTeam = z.object({ id: z.number(), name: z.string().nullable(), shortName: z.string().nullable() });
const FdResponse = z.object({
  matches: z.array(
    z.object({
      id: z.number(),
      utcDate: z.string(),
      status: z.string(),
      lastUpdated: z.string(),
      competition: z.object({ code: z.string() }),
      homeTeam: fdTeam,
      awayTeam: fdTeam,
      score: z.object({ fullTime: z.object({ home: z.number().nullable(), away: z.number().nullable() }) }),
    }),
  ),
});

export interface LiveMatch {
  id: string;
  league: string;
  kickoffAt: string;
  state: LiveState;
  /** Raw provider status, shown when `state` is "off" (reporté, suspendu…). */
  status: string;
  updatedAt: string;
  home: { name: string; score: number | null };
  away: { name: string; score: number | null };
  popular: boolean;
}

export interface LiveBoard {
  fetchedAt: string;
  liveCount: number;
  popular: LiveMatch[];
  leagues: { code: string; name: string; matches: LiveMatch[] }[];
}

// Live first, then upcoming, then finished, then postponed; kickoff order within each.
const RANK: Record<LiveState, number> = { live: 0, paused: 0, scheduled: 1, finished: 2, off: 3 };
const byInterest = (a: LiveMatch, b: LiveMatch) => RANK[a.state] - RANK[b.state] || a.kickoffAt.localeCompare(b.kickoffAt);

/** Pure: validates the provider payload and arranges it for the screen. */
export function buildBoard(json: unknown, fetchedAt: string): LiveBoard {
  const matches: LiveMatch[] = FdResponse.parse(json)
    .matches.filter((m) => m.competition.code in LEAGUES)
    .map((m) => ({
      id: String(m.id),
      league: m.competition.code,
      kickoffAt: m.utcDate,
      state: STATE[m.status] ?? "off",
      status: m.status,
      updatedAt: m.lastUpdated,
      home: { name: m.homeTeam.shortName ?? m.homeTeam.name ?? "?", score: m.score.fullTime.home },
      away: { name: m.awayTeam.shortName ?? m.awayTeam.name ?? "?", score: m.score.fullTime.away },
      popular: POPULAR_TEAM_IDS.has(m.homeTeam.id) || POPULAR_TEAM_IDS.has(m.awayTeam.id),
    }))
    .sort(byInterest);
  return {
    fetchedAt,
    liveCount: matches.filter((m) => m.state === "live" || m.state === "paused").length,
    popular: matches.filter((m) => m.popular),
    leagues: Object.entries(LEAGUES)
      .map(([code, name]) => ({ code, name, matches: matches.filter((m) => m.league === code) }))
      .filter((l) => l.matches.length > 0),
  };
}

/** Today's matches (UTC day), cached one minute. Null when the key is missing or the provider fails. */
export async function getLiveBoard(): Promise<LiveBoard | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.football-data.org/v4/matches?competitions=${Object.keys(LEAGUES).join(",")}`, {
      headers: { "X-Auth-Token": key },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`football-data ${res.status}`);
    return buildBoard(await res.json(), new Date().toISOString());
  } catch (e) {
    console.error("[live]", e);
    return null;
  }
}
