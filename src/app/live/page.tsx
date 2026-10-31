import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, Radio } from "lucide-react";
import { getLiveBoard, LEAGUES, type LiveMatch } from "@/lib/live";
import { card, EmptyState, TeamBadge } from "@/components/ui/bits";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Time } from "@/components/ui/time";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { isLive, StateLabel } from "@/components/live/state-label";

export const metadata: Metadata = { title: "Direct" };


export default function LivePage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Direct</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Scores du jour, actualisés environ chaque minute (football-data.org, léger différé possible).</p>
      <AutoRefresh seconds={60} />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const board = await getLiveBoard();
  if (!board)
    return (
      <EmptyState icon={Radio} title="Direct indisponible">
        Les scores n&apos;ont pas pu être récupérés. Nouvel essai automatique dans une minute.
      </EmptyState>
    );
  if (board.leagues.length === 0)
    return (
      <EmptyState icon={Radio} title="Aucun match aujourd'hui">
        Aucune rencontre des cinq championnats suivis n&apos;est prévue aujourd&apos;hui.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      <p className="mb-5 text-sm text-muted">
        <span className="font-semibold text-text">{board.liveCount}</span> match{board.liveCount > 1 ? "s" : ""} en cours · mis à jour{" "}
        <Time iso={board.fetchedAt} mode="relative" />
      </p>
      {board.popular.length > 0 && <Drawer title="Populaires" matches={board.popular} open showLeague />}
      {/* Leagues stay folded unless a match is being played, so the page is not one long list. */}
      {board.leagues.map((l) => (
        <Drawer key={l.code} title={l.name} matches={l.matches} open={l.matches.some(isLive)} />
      ))}
    </div>
  );
}

function Drawer({ title, matches, open, showLeague = false }: { title: string; matches: LiveMatch[]; open: boolean; showLeague?: boolean }) {
  const live = matches.filter(isLive).length;
  return (
    <details open={open} className={`${card} group overflow-hidden`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        {live > 0 && <span className="text-xs font-semibold text-danger">{live} en direct</span>}
        <span className="text-xs font-normal text-muted">{matches.length} match{matches.length > 1 ? "s" : ""}</span>
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <MatchList matches={matches} showLeague={showLeague} />
    </details>
  );
}

function MatchList({ matches, showLeague }: { matches: LiveMatch[]; showLeague: boolean }) {
  return (
    <ul className="divide-y divide-line border-t border-line">
      {matches.map((m) => (
        <li key={m.id}>
          <Link href={`/live/${m.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
            <div className="w-24 shrink-0 text-xs">
              <StateLabel match={m} />
              {showLeague && <p className="mt-0.5 truncate text-muted">{LEAGUES[m.league]}</p>}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {[m.home, m.away].map((t, i) => (
                <p key={i} className="flex items-center gap-3 font-medium">
                  <TeamBadge team={{ shortName: t.name, crest: t.crest }} size="sm" />
                  <span className="flex-1 truncate">{t.name}</span>
                  {m.state !== "scheduled" && m.state !== "off" && (
                    <span className="text-lg font-semibold tabular-nums">{t.score ?? "–"}</span>
                  )}
                </p>
              ))}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
