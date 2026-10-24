import Link from "next/link";
import { selectionSignal } from "@/lib/odds/calc";
import { fmtOdds, outcomeCode } from "@/lib/formatting";
import { OUTCOMES, type Match } from "@/lib/types";
import { card, Freshness, OddsDelta, TeamBadge } from "@/components/ui/bits";
import { Time } from "@/components/ui/time";
import { FollowMatch } from "@/components/odds/slip-buttons";

const STATUS = { scheduled: null, live: "En direct", finished: "Terminé" } as const;

export function MatchCard({ match, now }: { match: Match; now: string }) {
  const signals = OUTCOMES.map((o) => selectionSignal(match.h2h[o], new Date(now)));
  const latest = signals.find((s) => s.current)?.current;
  return (
    <article className={`${card} relative p-4 transition-colors duration-150 hover:border-text/20`}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{match.competition.name}</span>
        <span className="flex items-center gap-2">
          {STATUS[match.status] && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text">{STATUS[match.status]}</span>}
          <Time iso={match.kickoffAt} mode="time" className="font-semibold text-text tabular-nums" />
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {[match.home, match.away].map((t) => (
            <p key={t.id} className="flex items-center gap-2.5 font-medium">
              <TeamBadge team={t} size="sm" />
              <span className="truncate">{t.name}</span>
            </p>
          ))}
        </div>
        <FollowMatch match={match} className="relative z-10 -mr-2 text-muted hover:text-text" />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {OUTCOMES.map((o, i) => (
          <div key={o} className="rounded-[14px] bg-surface-2 px-3 py-2">
            <dt className="text-[11px] text-muted">{outcomeCode[o]}</dt>
            <dd className="text-[17px] font-semibold tabular-nums">
              {signals[i].current ? fmtOdds(signals[i].current!.odds) : "–"}
            </dd>
            <dd>
              <OddsDelta changePct={signals[i].changePct} className="text-[11px]" />
            </dd>
          </div>
        ))}
      </dl>

      {latest && match.status === "scheduled" && (
        <p className="mt-3">
          <Freshness iso={latest.observedAt} ageHours={signals[0].ageHours} />
        </p>
      )}
      {/* Whole card is the link; the follow button sits above it. */}
      <Link href={`/match/${match.id}`} className="absolute inset-0 rounded-card" aria-label={`Analyse ${match.home.name} – ${match.away.name}`} />
    </article>
  );
}
