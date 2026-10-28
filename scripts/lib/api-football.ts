import { z } from "zod";
import { getWithRetry, HttpError } from "./http.ts";

export interface AfFixture { id: number; date: string; leagueId: number; home: string; away: string; status: string }
export interface AfOdds {
  fixtureId: number;
  update: string;
  bookmakers: { name: string; bets: { id: number; values: { value: string; odd: string }[] }[] }[];
}
export interface ApiFootball {
  fixtures(date: string): Promise<AfFixture[]>;
  odds(fixtureId: number): Promise<AfOdds | null>;
}

/** League ids → football-data codes (our competitions.football_data_code). */
export const AF_LEAGUES: Record<number, string> = { 39: "PL", 140: "PD", 135: "SA", 78: "BL1", 61: "FL1" };

const Envelope = z.object({ errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]), response: z.array(z.unknown()) });
const Fixture = z.object({
  fixture: z.object({ id: z.number(), date: z.string(), status: z.object({ short: z.string().nullable() }) }),
  league: z.object({ id: z.number() }),
  teams: z.object({ home: z.object({ name: z.string() }), away: z.object({ name: z.string() }) }),
});
const text = z.union([z.string(), z.number()]).transform(String);
const Odds = z.object({
  fixture: z.object({ id: z.number() }),
  update: z.string(),
  bookmakers: z.array(z.object({
    name: z.string(),
    // Some bets (exact goals…) send numbers; only strings are used downstream.
    bets: z.array(z.object({ id: z.number(), values: z.array(z.object({ value: text, odd: text })) })),
  })),
});

/** The API answered 200 with an `errors` payload (rateLimit → status 429): retrying only burns requests. */
export class AfApiError extends HttpError {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Free plan: 10 requests/minute, 100/day. The pause keeps us under the per-minute limit. */
export function apiFootball(key: string, fetchImpl: typeof fetch = fetch, sleepMs = 6500): ApiFootball {
  let first = true;
  async function get(path: string): Promise<unknown[]> {
    if (!first) await sleep(sleepMs);
    first = false;
    const res = await getWithRetry(`https://v3.football.api-sports.io${path}`, { headers: { "x-apisports-key": key } }, { fetchImpl, attempts: 1 });
    const parsed = Envelope.safeParse(await res.json());
    if (!parsed.success) throw new Error(`Réponse API-Football inattendue pour ${path.split("?")[0]} : ${parsed.error.issues[0]?.message}`);
    const { errors } = parsed.data;
    if (Array.isArray(errors) ? errors.length : Object.keys(errors).length) {
      const msg = `API-Football : ${JSON.stringify(errors)}`;
      throw new AfApiError(!Array.isArray(errors) && "rateLimit" in errors ? 429 : 200, msg);
    }
    return parsed.data.response;
  }
  const bad = (what: string, e: z.ZodError) => new Error(`Réponse API-Football inattendue (${what}) : ${e.issues[0]?.message}`);

  return {
    async fixtures(date) {
      const r = z.array(Fixture).safeParse(await get(`/fixtures?date=${date}`));
      if (!r.success) throw bad("fixtures", r.error);
      return r.data.map((f) => ({
        id: f.fixture.id, date: f.fixture.date, leagueId: f.league.id,
        home: f.teams.home.name, away: f.teams.away.name, status: f.fixture.status.short ?? "",
      }));
    },
    async odds(fixtureId) {
      const item = (await get(`/odds?fixture=${fixtureId}`))[0];
      if (item === undefined) return null;
      const r = Odds.safeParse(item);
      if (!r.success) throw bad("odds", r.error);
      return { fixtureId: r.data.fixture.id, update: r.data.update, bookmakers: r.data.bookmakers };
    },
  };
}
