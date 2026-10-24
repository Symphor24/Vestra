// Usage: node scripts/generate-combos.ts — regenerates tickets, keeps identical ones, invalidates the rest.
import { generateCombos } from "./lib/combos.ts";
import { main } from "./lib/main.ts";

await main("generate-combos", async (db, now) => {
  const result = await generateCombos(db, now);
  return { items: result.created, result };
});
