// Usage: node scripts/generate-combos.ts — builds tomorrow's tickets once, from 13:00 UTC; later runs of the same day change nothing.
import { generateCombos } from "./lib/combos.ts";
import { main } from "./lib/main.ts";

await main("generate-combos", async (db, now) => {
  const result = await generateCombos(db, now);
  return { items: result.created, result };
});
