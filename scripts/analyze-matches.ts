// Usage: node scripts/analyze-matches.ts — recomputes matches_analysis for upcoming matches.
import { analyzeMatches } from "./lib/analyze.ts";
import { main } from "./lib/main.ts";

await main("analyze", async (db, now) => {
  const rows = await analyzeMatches(db, now);
  return { items: rows, result: { analysedSelections: rows } };
});
