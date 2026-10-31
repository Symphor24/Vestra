// Usage: node scripts/generate-combos.ts — builds tomorrow's tickets once, from 13:00 UTC; later runs of the same day change nothing.
// Season statistics need FOOTBALL_DATA_API_KEY (optional): 5 calls, once a day. Without it, legs are priced by the market alone.
import { generateCombos } from "./lib/combos.ts";
import { CombosEnv } from "./lib/env.ts";
import { footballDataSeason } from "./lib/football-data.ts";
import { main } from "./lib/main.ts";

await main(
  "generate-combos",
  async (db, now, env) => {
    const result = await generateCombos(db, now, env.FOOTBALL_DATA_API_KEY ? footballDataSeason(env.FOOTBALL_DATA_API_KEY) : undefined);
    return { items: result.created, result };
  },
  CombosEnv,
);
