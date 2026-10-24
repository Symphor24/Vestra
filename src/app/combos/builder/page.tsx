import type { Metadata } from "next";
import { Suspense } from "react";
import { getMatches } from "@/lib/data";
import { SlipBuilder } from "@/components/combos/slip-builder";
import { ListSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Mon ticket" };

export default function BuilderPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Mon ticket</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Ajoutez ou retirez des sélections : la cote totale se recalcule aussitôt.</p>
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { matches, now } = await getMatches();
  return <SlipBuilder matches={matches} now={now} />;
}
