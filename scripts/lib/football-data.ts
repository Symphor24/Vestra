import { z } from "zod";
import { getWithRetry } from "./http.ts";

const Team = z.object({ id: z.number().nullable(), name: z.string().nullable(), shortName: z.string().nullable(), crest: z.string().nullable().optional() });
const FdMatch = z.object({
  id: z.number(),
  utcDate: z.iso.datetime(),
  status: z.string(),
  homeTeam: Team,
  awayTeam: Team,
  score: z.object({ fullTime: z.object({ home: z.number().int().nullable(), away: z.number().int().nullable() }) }),
});
export type FdMatch = z.infer<typeof FdMatch>;

/** Matches of one competition between two dates (YYYY-MM-DD, inclusive). */
export type FetchFdMatches = (code: string, dateFrom: string, dateTo: string) => Promise<FdMatch[]>;

async function getMatches(apiKey: string, code: string, query: string, fetchImpl: typeof fetch): Promise<FdMatch[]> {
  const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(code)}/matches?${query}`;
  const res = await getWithRetry(url, { headers: { "X-Auth-Token": apiKey } }, { fetchImpl });
  const parsed = z.object({ matches: z.array(FdMatch) }).safeParse(await res.json());
  if (!parsed.success) throw new Error(`Réponse football-data.org inattendue pour ${code} : ${parsed.error.issues[0]?.message}`);
  return parsed.data.matches;
}

/** Free tier: 10 requests/minute; Vestra makes at most one per league per run. */
export function footballData(apiKey: string, fetchImpl: typeof fetch = fetch): FetchFdMatches {
  return (code, dateFrom, dateTo) => getMatches(apiKey, code, `dateFrom=${dateFrom}&dateTo=${dateTo}`, fetchImpl);
}

/** Every finished match of the competition's current season (one call). */
export type FetchFdSeason = (code: string) => Promise<FdMatch[]>;

export function footballDataSeason(apiKey: string, fetchImpl: typeof fetch = fetch): FetchFdSeason {
  return (code) => getMatches(apiKey, code, "status=FINISHED", fetchImpl);
}
