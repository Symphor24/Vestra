import { z } from "zod";
import { getWithRetry } from "./http.ts";

const Team = z.object({ id: z.number().nullable(), name: z.string().nullable(), shortName: z.string().nullable() });
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

/** Free tier: 10 requests/minute; Vestra makes at most one per league per run. */
export function footballData(apiKey: string, fetchImpl: typeof fetch = fetch): FetchFdMatches {
  return async (code, dateFrom, dateTo) => {
    const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(code)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const res = await getWithRetry(url, { headers: { "X-Auth-Token": apiKey } }, { fetchImpl });
    const parsed = z.object({ matches: z.array(FdMatch) }).safeParse(await res.json());
    if (!parsed.success) throw new Error(`Réponse football-data.org inattendue pour ${code} : ${parsed.error.issues[0]?.message}`);
    return parsed.data.matches;
  };
}
