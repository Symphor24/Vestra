// Usage: node scripts/ingest-markets.ts — tomorrow's multi-market odds from API-Football (free plan).
import { apiFootball } from "./lib/api-football.ts";
import { MarketsEnv } from "./lib/env.ts";
import { main } from "./lib/main.ts";
import { ingestMarkets } from "./lib/markets-ingest.ts";

await main(
  "ingest-markets",
  async (db, now, env) => {
    const result = await ingestMarkets(db, apiFootball(env.API_FOOTBALL_KEY), now);
    // Provider failures fail the run (visible in GitHub); unmatched fixtures are only reported.
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    return { items: result.snapshots, result, credits: result.requests };
  },
  MarketsEnv,
);
