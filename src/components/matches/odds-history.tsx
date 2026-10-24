"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { outcomeLabel } from "@/lib/formatting";
import { OUTCOMES, type Match, type Outcome } from "@/lib/types";
import { OddsChart } from "@/components/charts/odds-chart";

export function OddsHistory({ match }: { match: Match }) {
  const [o, setO] = useState<Outcome>("home");
  const points = match.h2h[o];
  return (
    <div>
      <div className="mb-4 flex rounded-full border border-line bg-bg p-1" role="group" aria-label="Sélection affichée">
        {OUTCOMES.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={o === k}
            onClick={() => setO(k)}
            className={`min-h-9 flex-1 truncate rounded-full px-2 text-sm font-medium transition-colors duration-150 ${o === k ? "bg-surface-2 text-text" : "text-muted"}`}
          >
            {outcomeLabel(match, k)}
          </button>
        ))}
      </div>
      {points.length >= 2 ? (
        <OddsChart key={o} points={points} label={outcomeLabel(match, o)} />
      ) : (
        <p className="flex gap-2 rounded-[14px] bg-surface-2 p-4 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Une seule observation pour l&apos;instant. Le graphique apparaîtra après la prochaine synchronisation : une courbe à un point serait trompeuse.
        </p>
      )}
    </div>
  );
}
