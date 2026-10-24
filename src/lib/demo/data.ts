// DEMO DATA — fictitious prices for the prototype. Never shown without the demo banner.
import type { Competition, Match, OddsPoint, Outcome, Team } from "@/lib/types";

const comp = (id: string, name: string, country: string): Competition => ({ id, name, country });
const C = {
  pl: comp("pl", "Premier League", "Angleterre"),
  liga: comp("liga", "LaLiga", "Espagne"),
  sa: comp("sa", "Serie A", "Italie"),
  bl: comp("bl", "Bundesliga", "Allemagne"),
  l1: comp("l1", "Ligue 1", "France"),
};

const team = (name: string, shortName = name): Team => ({
  id: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name,
  shortName,
});

type Triple = [number, number, number];
interface Spec {
  id: string;
  c: Competition;
  home: Team;
  away: Team;
  /** Hours from now. */
  kickoff: number;
  first: Triple;
  last: Triple;
  /** Hours ago of each observation, oldest first. */
  obs: number[];
  status?: Match["status"];
}

const OBS = [54, 46, 30, 22, 6];

const SPECS: Spec[] = [
  { id: "ars-che", c: C.pl, home: team("Arsenal"), away: team("Chelsea"), kickoff: 5, first: [2.1, 3.5, 3.4], last: [1.85, 3.7, 4.2], obs: OBS },
  { id: "liv-avl", c: C.pl, home: team("Liverpool"), away: team("Aston Villa", "Villa"), kickoff: 26, first: [1.62, 4.2, 5.0], last: [1.55, 4.4, 5.6], obs: OBS },
  { id: "mci-tot", c: C.pl, home: team("Manchester City", "Man City"), away: team("Tottenham", "Spurs"), kickoff: 28, first: [1.4, 5.0, 7.0], last: [1.28, 5.8, 9.5], obs: [62, 46, 20] },
  { id: "rma-sev", c: C.liga, home: team("Real Madrid", "Real"), away: team("Sevilla", "Séville"), kickoff: 29, first: [1.45, 4.8, 6.5], last: [1.3, 5.5, 9.0], obs: OBS },
  { id: "atm-rso", c: C.liga, home: team("Atlético Madrid", "Atlético"), away: team("Real Sociedad", "Sociedad"), kickoff: 48, first: [1.9, 3.4, 4.3], last: [2.05, 3.3, 3.75], obs: OBS },
  { id: "int-laz", c: C.sa, home: team("Inter"), away: team("Lazio"), kickoff: 6, first: [1.75, 3.7, 4.8], last: [1.55, 4.0, 6.0], obs: OBS },
  { id: "juv-rom", c: C.sa, home: team("Juventus", "Juve"), away: team("Roma"), kickoff: 32, first: [2.2, 3.1, 3.5], last: [2.25, 3.1, 3.4], obs: OBS },
  { id: "fcb-b04", c: C.bl, home: team("Bayern Munich", "Bayern"), away: team("Bayer Leverkusen", "Leverkusen"), kickoff: 51, first: [1.7, 4.2, 4.4], last: [1.52, 4.6, 5.6], obs: OBS },
  { id: "bvb-rbl", c: C.bl, home: team("Borussia Dortmund", "Dortmund"), away: team("RB Leipzig", "Leipzig"), kickoff: 24, first: [2.0, 3.75, 3.4], last: [2.15, 3.8, 3.05], obs: OBS },
  { id: "psg-om", c: C.l1, home: team("Paris Saint-Germain", "PSG"), away: team("Marseille", "OM"), kickoff: 54, first: [1.5, 4.5, 6.0], last: [1.33, 5.2, 8.5], obs: OBS },
  { id: "ol-losc", c: C.l1, home: team("Lyon", "OL"), away: team("Lille", "LOSC"), kickoff: 27, first: [2.4, 3.4, 2.9], last: [2.6, 3.4, 2.55], obs: OBS },
  { id: "asm-ogcn", c: C.l1, home: team("Monaco"), away: team("Nice"), kickoff: 72, first: [1.95, 3.6, 3.8], last: [1.95, 3.6, 3.8], obs: [6] },
  { id: "nap-mil", c: C.sa, home: team("Napoli", "Naples"), away: team("Milan"), kickoff: -22, first: [2.3, 3.3, 3.1], last: [2.1, 3.4, 3.5], obs: [70, 54, 30], status: "finished" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Interpolates between first and last so every observation lies on a plausible path. */
function series(first: number, last: number, hoursAgo: number[], now: number): OddsPoint[] {
  const n = hoursAgo.length;
  return hoursAgo.map((h, i) => ({
    observedAt: new Date(now - h * 3_600_000).toISOString(),
    odds: round2(n === 1 ? first : first + ((last - first) * i) / (n - 1)),
  }));
}

export function buildDemoMatches(now: number): Match[] {
  return SPECS.map((s) => {
    const h2h = {} as Record<Outcome, OddsPoint[]>;
    (["home", "draw", "away"] as Outcome[]).forEach((o, i) => {
      h2h[o] = series(s.first[i], s.last[i], s.obs, now);
    });
    return {
      id: s.id,
      competition: s.c,
      home: s.home,
      away: s.away,
      kickoffAt: new Date(now + s.kickoff * 3_600_000).toISOString(),
      status: s.status ?? "scheduled",
      lastSyncedAt: new Date(now - s.obs.at(-1)! * 3_600_000).toISOString(),
      bookmaker: "Bookmaker de démonstration",
      h2h,
    };
  });
}

export const DEMO_COMPETITIONS = Object.values(C);
