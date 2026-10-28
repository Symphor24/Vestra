// Usage: node scripts/ingest-results.ts — records final scores and postponements, links upcoming matches, settles combos from football-data.org.
import { ResultsEnv } from "./lib/env.ts";
import { footballData } from "./lib/football-data.ts";
import { main } from "./lib/main.ts";
import { ingestResults } from "./lib/results.ts";
import { settleTickets } from "./lib/settle-tickets.ts";

await main(
  "ingest-results",
  async (db, now, env) => {
    const result = await ingestResults(db, footballData(env.FOOTBALL_DATA_API_KEY), now);
    // Settlement only reads the DB: a failing league must not block it. Provider failures still fail the run (visible in GitHub).
    const settled = await settleTickets(db, now);
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    return { items: result.finished + result.postponedOrCancelled + settled.legs, result: { ...result, settled } };
  },
  ResultsEnv,
);
