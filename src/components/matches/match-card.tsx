import Link from "next/link";
import { favoriteIndex, selectionSignal } from "@/lib/odds/calc";
import { fmtOdds, outcomeCode } from "@/lib/formatting";
import { OUTCOMES, type Match } from "@/lib/types";
import { card, Freshness, OddsDelta, TeamBadge } from "@/components/ui/bits";
import { Time } from "@/components/ui/time";
import { FollowMatch } from "@/components/odds/slip-buttons";

const STATUS = { scheduled: null, live: "En direct", finished: "Terminé" } as const;

export function MatchCard({ match, now }: { match: Match; now: string }) {
  const signals = OUTCOMES.map((o) => selectionSignal(match.h2h[o], new Date(now), match.confirmedAt));
  const latest = signals.find((s) => s.checkedAt);
  const fav = favoriteIndex(signals.map((s) => s.current?.odds));
  return (
    <article className={`${card} relative p-4 transition-colors duration-150 hover:border-text/20`}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-muted">{match.competition.name}</span>
        <span className="flex items-center gap-2">
          {STATUS[match.status] && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{STATUS[match.status]}</span>}
          <Time iso={match.kickoffAt} mode="time" className="rounded-full bg-text px-2.5 py-1 font-semibold text-bg tabular-nums" />
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {([[match.home, match.homeScore], [match.away, match.awayScore]] as const).map(([t, score]) => (
            <p key={t.id} className="flex items-center gap-2.5 text-[15px] font-semibold">
              <TeamBadge team={t} size="sm" />
              <span className="flex-1 truncate">{t.name}</span>
              {match.status === "finished" && score != null && <span className="text-lg font-semibold tabular-nums">{score}</span>}
            </p>
          ))}
        </div>
        <FollowMatch match={match} className="relative z-10 -mr-2 text-muted hover:text-text" />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
        {OUTCOMES.map((o, i) => {
          const isFav = i === fav;
          return (
            <div
              key={o}
              className={`rounded-[14px] border px-3 py-2.5 ${isFav ? "border-accent bg-accent/15" : "border-line bg-bg"}`}
            >
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <span className={`grid size-5 place-items-center rounded-md font-bold ${isFav ? "bg-accent text-accent-ink" : "bg-surface-2 text-text"}`}>
                  {outcomeCode[o]}
                </span>
                {isFav && <span title="Cote la plus basse : l'issue que le marché juge la plus probable">Favori</span>}
              </dt>
              <dd className="mt-1.5 text-xl leading-none font-bold tabular-nums">
                {signals[i].current ? fmtOdds(signals[i].current!.odds) : "–"}
              </dd>
              <dd className="mt-1.5">
                {signals[i].changePct === null ? (
                  <span className="text-[11px] text-muted">
                    –<span className="sr-only">Historique insuffisant</span>
                  </span>
                ) : (
                  <OddsDelta changePct={signals[i].changePct} className="text-[11px]" />
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {latest && match.status === "scheduled" && (
        <p className="mt-3">
          <Freshness iso={latest.checkedAt!} ageHours={latest.ageHours} />
        </p>
      )}
      {/* Whole card is the link; the follow button sits above it. */}
      <Link href={`/match/${match.id}`} className="absolute inset-0 rounded-card" aria-label={`Analyse ${match.home.name} – ${match.away.name}`} />
    </article>
  );
}
