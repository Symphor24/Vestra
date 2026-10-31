import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { getLiveBoard, LEAGUES } from "@/lib/live";
import { TeamBadge } from "@/components/ui/bits";
import { Field } from "@/components/ui/pitch";
import { DetailSkeleton, ListSkeleton } from "@/components/ui/skeletons";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { StateLabel } from "@/components/live/state-label";
import { MatchStats } from "@/components/matches/match-stats";

export const metadata: Metadata = { title: "Match en direct" };

export default function LiveMatchPage({ params }: PageProps<"/live/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = await getLiveBoard();
  const m = board?.popular.find((x) => x.id === id) ?? board?.leagues.flatMap((l) => l.matches).find((x) => x.id === id);
  if (!m) notFound();
  const started = m.state !== "scheduled" && m.state !== "off";

  return (
    <article className="-mx-4 -mt-5 sm:mx-0 sm:mt-0">
      <AutoRefresh seconds={60} />
      <Field className="px-4 pt-4 pb-12 sm:rounded-card sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/live" aria-label="Retour au direct" className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/15">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="text-sm font-medium">{LEAGUES[m.league]}</span>
          <span className="size-11" aria-hidden="true" />
        </div>
        <div className="mt-8 text-center">
          <p className="text-sm"><StateLabel match={m} /></p>
          <h1 className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="flex flex-col items-center gap-2">
              <TeamBadge team={{ shortName: m.home.name, crest: m.home.crest }} size="lg" onHero />
              {m.home.name}
            </span>
            {started ? (
              <span className="text-[34px] font-semibold tabular-nums" aria-label={`Score ${m.home.score ?? 0} à ${m.away.score ?? 0}`}>
                {m.home.score ?? "–"} – {m.away.score ?? "–"}
              </span>
            ) : (
              <span className="text-hero-muted" aria-label="contre">–</span>
            )}
            <span className="flex flex-col items-center gap-2">
              <TeamBadge team={{ shortName: m.away.name, crest: m.away.crest }} size="lg" onHero />
              {m.away.name}
            </span>
          </h1>
        </div>
      </Field>

      <div className="relative -mt-6 space-y-4 rounded-t-card bg-bg px-4 pt-5 sm:px-0">
        <Suspense fallback={<ListSkeleton rows={3} night />}>
          <MatchStats code={m.league} home={{ fdId: m.home.id, name: m.home.name }} away={{ fdId: m.away.id, name: m.away.name }} fdMatchId={m.id} />
        </Suspense>
      </div>
    </article>
  );
}
