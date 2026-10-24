import type { Metadata } from "next";
import { Suspense } from "react";
import { getCompetitions, getMatches } from "@/lib/data";
import { MatchesBrowser } from "@/components/matches/matches-browser";
import { ListSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Matchs" };

export default function MatchesPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Matchs</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Cotes du marché 1N2, actualisées plusieurs fois par jour.</p>
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const [{ matches, now }, competitions] = await Promise.all([getMatches(), getCompetitions()]);
  return <MatchesBrowser matches={matches} competitions={competitions} now={now} />;
}
