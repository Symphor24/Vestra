import { z } from "zod";
import { getWithRetry } from "./http.ts";

const BASE = "https://api.the-odds-api.com/v4";

const Outcome = z.object({ name: z.string(), price: z.number() });
const Market = z.object({ key: z.string(), last_update: z.iso.datetime().optional(), outcomes: z.array(Outcome) });
const Bookmaker = z.object({ key: z.string(), title: z.string(), last_update: z.iso.datetime(), markets: z.array(Market) });
export const OddsEvent = z.object({
  id: z.string().min(1),
  sport_key: z.string(),
  commence_time: z.iso.datetime(),
  home_team: z.string().min(1),
  away_team: z.string().min(1),
  bookmakers: z.array(Bookmaker),
});
export type OddsEvent = z.infer<typeof OddsEvent>;

export interface OddsResponse {
  events: OddsEvent[];
  /** Credits charged for this call (x-requests-last), and what the provider says is left. */
  creditsUsed: number;
  creditsRemaining: number | null;
}

export type FetchOdds = (sportKey: string) => Promise<OddsResponse>;

const num = (v: string | null) => (v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Cost: 1 credit per market per region per call. Launch scope = 1 market (h2h) × 1 region (eu). */
export function oddsApi(apiKey: string, fetchImpl: typeof fetch = fetch): FetchOdds {
  return async (sportKey) => {
    const params = new URLSearchParams({ apiKey, regions: "eu", markets: "h2h", oddsFormat: "decimal", dateFormat: "iso" });
    const res = await getWithRetry(`${BASE}/sports/${encodeURIComponent(sportKey)}/odds?${params}`, {}, { fetchImpl });
    const parsed = z.array(OddsEvent).safeParse(await res.json());
    if (!parsed.success) throw new Error(`Réponse The Odds API inattendue pour ${sportKey} : ${parsed.error.issues[0]?.message}`);
    return {
      events: parsed.data,
      creditsUsed: num(res.headers.get("x-requests-last")) ?? 0,
      creditsRemaining: num(res.headers.get("x-requests-remaining")),
    };
  };
}
