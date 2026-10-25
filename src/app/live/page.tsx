import type { Metadata } from "next";
import { Suspense } from "react";
import { Radio } from "lucide-react";
import { getLiveBoard, LEAGUES, type LiveMatch } from "@/lib/live";
import { card, EmptyState, SectionTitle } from "@/components/ui/bits";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Time } from "@/components/ui/time";
import { AutoRefresh } from "@/components/live/auto-refresh";

export const metadata: Metadata = { title: "Direct" };

const OFF: Record<string, string> = { POSTPONED: "Reporté", SUSPENDED: "Suspendu", CANCELLED: "Annulé" };

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
    <div className="space-y-8">
      <p className="text-sm text-muted">
        <span className="font-semibold text-text">{board.liveCount}</span> match{board.liveCount > 1 ? "s" : ""} en cours · mis à jour{" "}
        <Time iso={board.fetchedAt} mode="relative" />
      </p>
      {board.popular.length > 0 && (
        <section>
          <SectionTitle>Populaires</SectionTitle>
          <MatchList matches={board.popular} showLeague />
        </section>
      )}
      {board.leagues.map((l) => (
        <section key={l.code}>
          <SectionTitle>{l.name}</SectionTitle>
          <MatchList matches={l.matches} />
        </section>
      ))}
    </div>
  );
}

function MatchList({ matches, showLeague = false }: { matches: LiveMatch[]; showLeague?: boolean }) {
  return (
    <ul className={`${card} divide-y divide-line`}>
      {matches.map((m) => (
        <li key={m.id} className="flex items-center gap-4 px-4 py-3">
          <div className="w-24 shrink-0 text-xs">
            <StateLabel match={m} />
            {showLeague && <p className="mt-0.5 truncate text-muted">{LEAGUES[m.league]}</p>}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {[m.home, m.away].map((t, i) => (
              <p key={i} className="flex items-center gap-3 font-medium">
                <span className="flex-1 truncate">{t.name}</span>
                {m.state !== "scheduled" && m.state !== "off" && (
                  <span className="text-lg font-semibold tabular-nums">{t.score ?? "–"}</span>
                )}
              </p>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StateLabel({ match: m }: { match: LiveMatch }) {
  if (m.state === "live" || m.state === "paused")
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
        <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        {m.state === "paused" ? "Mi-temps" : "En direct"}
      </span>
    );
  if (m.state === "finished") return <span className="font-medium text-muted">Terminé</span>;
  if (m.state === "off") return <span className="font-medium text-warn">{OFF[m.status] ?? m.status}</span>;
  return <Time iso={m.kickoffAt} mode="time" className="font-semibold tabular-nums" />;
}
