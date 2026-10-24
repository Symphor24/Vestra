// Usage: node scripts/ingest-odds.ts   (Node ≥ 22.18 runs TypeScript directly)
import { connect } from "./lib/db.ts";
import { IngestEnv, loadEnv } from "./lib/env.ts";
import { ingestOdds } from "./lib/ingest.ts";
import { oddsApi } from "./lib/odds-api.ts";

let env;
try {
  env = loadEnv(IngestEnv);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const db = connect(env.DATABASE_URL);
try {
  const result = await ingestOdds({ db, fetchOdds: oddsApi(env.ODDS_API_KEY), cap: env.ODDS_API_MONTHLY_CREDIT_CAP });
  console.log(JSON.stringify(result, null, 2));
  // A non-zero exit makes the scheduled workflow show as failed (GitHub e-mails the owner).
  if (result.errors.length) process.exitCode = 1;
} finally {
  await db.close();
}
