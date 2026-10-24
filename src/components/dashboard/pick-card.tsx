import Link from "next/link";
import type { Candidate } from "@/lib/combos/generate";
import { fmtOdds, fmtPct, MARKET_LABEL, matchLabel, outcomeLabel } from "@/lib/formatting";
import { ageHours } from "@/lib/odds/calc";
import { btn, Freshness, OddsDelta, TeamBadge } from "@/components/ui/bits";
import { Time } from "@/components/ui/time";
import { AddToSlip } from "@/components/odds/slip-buttons";

export function PickCard({ pick, now }: { pick: Candidate; now: string }) {
  const { match: m } = pick;
  const label = outcomeLabel(m, pick.outcome);
  return (
    <article className="flex w-[300px] shrink-0 snap-start flex-col rounded-card border border-line bg-surface p-4 sm:w-auto">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{m.competition.name}</span>
        <Time iso={m.kickoffAt} mode="short" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex -space-x-2">
          <TeamBadge team={m.home} />
          <TeamBadge team={m.away} />
        </span>
        <h3 className="min-w-0 truncate font-semibold">{matchLabel(m)}</h3>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 rounded-[16px] bg-surface-2 p-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">{MARKET_LABEL}</p>
          <p className="truncate font-medium">{label}</p>
          <OddsDelta changePct={((pick.odds - pick.firstOdds) / pick.firstOdds) * 100} />
        </div>
        <p className="text-right">
          <span className="block text-[11px] text-muted">Cote</span>
          <span className="text-[28px] leading-none font-semibold tabular-nums">{fmtOdds(pick.odds)}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Freshness iso={pick.observedAt} ageHours={ageHours(pick.observedAt, new Date(now))} />
        {pick.marketProbability !== null && (
          <span className="text-xs text-muted">Proba. implicite {fmtPct(pick.marketProbability * 100, 0)}</span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/match/${m.id}`} className={`${btn.base} ${btn.secondary} flex-1`}>
          Voir l&apos;analyse
        </Link>
        <AddToSlip
          compact
          leg={{ matchId: m.id, outcome: pick.outcome, odds: pick.odds, observedAt: pick.observedAt, label, matchLabel: matchLabel(m) }}
        />
      </div>
    </article>
  );
}
