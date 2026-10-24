import { consensusDeviationPct, RULES } from "../../src/lib/combos/generate.ts";
import { normalizedProbabilities, selectionSignal, STALE_AFTER_HOURS } from "../../src/lib/odds/calc.ts";
import { OUTCOMES } from "../../src/lib/types.ts";
import type { Db } from "./db.ts";
import { loadMatches } from "./matches.ts";

type Quality = "ok" | "insufficient_history" | "stale" | "invalid" | "divergent";
const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

/** Recomputes matches_analysis for every upcoming match. Facts only: no model, no confidence score. */
export async function analyzeMatches(db: Db, now: Date): Promise<number> {
  const matches = await loadMatches(db, now);
  let written = 0;
  for (const m of matches) {
    const probs = normalizedProbabilities(OUTCOMES.map((o) => m.h2h[o].at(-1)?.odds ?? NaN));
    for (const [i, o] of OUTCOMES.entries()) {
      const s = selectionSignal(m.h2h[o], now, m.confirmedAt);
      const dev = s.current ? consensusDeviationPct(m, o, s.current.odds) : null;
      const quality: Quality = !s.current
        ? "invalid"
        : s.stale
          ? "stale"
          : s.observations < RULES.minObservations
            ? "insufficient_history"
            : dev !== null && dev > RULES.maxConsensusDeviationPct
              ? "divergent"
              : "ok";
      const rationale = {
        invalid: "Aucun prix valide chez le bookmaker de référence.",
        stale: `Prix non confirmé depuis plus de ${STALE_AFTER_HOURS} h.`,
        insufficient_history: "Une seule observation : variation non mesurable.",
        divergent: `Écart de ${pct(dev ?? 0)} avec la cote médiane de ${m.bookmakerCount} bookmakers.`,
        ok: s.first && s.current && s.changePct !== null
          ? `Cote passée de ${s.first.odds.toFixed(2)} à ${s.current.odds.toFixed(2)} (${s.changePct > 0 ? "+" : "−"}${pct(Math.abs(s.changePct))}) sur ${s.observations} observations.`
          : "",
      }[quality];

      await db.query(
        `insert into public.matches_analysis (match_id, bookmaker, market_key, selection_key,
           first_observed_odds, current_odds, observation_count, odds_change_percent,
           implied_probability, normalized_probability, consensus_odds, bookmaker_count,
           rationale, data_quality_status, analyzed_at)
         values ($1, $2, 'h2h', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (match_id, bookmaker, market_key, selection_key) do update set
           first_observed_odds = excluded.first_observed_odds, current_odds = excluded.current_odds,
           observation_count = excluded.observation_count, odds_change_percent = excluded.odds_change_percent,
           implied_probability = excluded.implied_probability, normalized_probability = excluded.normalized_probability,
           consensus_odds = excluded.consensus_odds, bookmaker_count = excluded.bookmaker_count,
           rationale = excluded.rationale, data_quality_status = excluded.data_quality_status,
           analyzed_at = excluded.analyzed_at`,
        [
          m.id, m.bookmaker, o,
          s.first?.odds ?? null, s.current?.odds ?? null, s.observations,
          s.changePct === null ? null : Math.round(s.changePct * 100) / 100,
          s.current ? 1 / s.current.odds : null, probs?.[i] ?? null,
          m.consensus?.[o] ?? null, m.bookmakerCount,
          rationale, quality, now.toISOString(),
        ],
      );
      written++;
    }
  }
  return written;
}
