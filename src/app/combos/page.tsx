import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Layers, SlidersHorizontal } from "lucide-react";
import { getTicketBoard } from "@/lib/data";
import { ageHours, STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { TicketCard } from "@/components/combos/ticket-card";
import { TicketsBrowser } from "@/components/combos/tickets-browser";
import { btn, EmptyState, SectionTitle } from "@/components/ui/bits";
import { ListSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Combinés" };

export default function CombosPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Combinés</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Les combinés de demain sont générés chaque jour vers 13 h UTC, par paliers de cote de ~2 à ~20 000 et +. La probabilité affichée est celle du marché, si les matchs étaient indépendants.
          </p>
        </div>
        <Link href="/combos/builder" className={`${btn.base} ${btn.primary}`}>
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Composer mon combiné
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8"><ListSkeleton rows={3} /></div>}>
        <Content />
      </Suspense>
      <p className="mt-10 max-w-prose text-xs leading-relaxed text-muted">
        La cote totale est le produit des cotes, valable pour des événements indépendants. Les règles du bookmaker, les corrélations et les changements de cote peuvent modifier la cote réellement proposée.{" "}
        <Link href="/about#methodologie" className="underline underline-offset-2 hover:text-text">Lire la méthodologie</Link>
      </p>
    </>
  );
}

async function Content() {
  const { tickets, now } = await getTicketBoard();
  if (tickets.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState icon={Layers} title="Aucun combiné pour l'instant.">
          Les combinés du prochain jour de matchs seront publiés vers 13 h UTC.
        </EmptyState>
      </div>
    );
  }
  // matchDay is YYYY-MM-DD: today's tickets if any, else the most recent day (string maximum).
  const today = now.slice(0, 10);
  const day = tickets.some((t) => t.matchDay === today)
    ? today
    : tickets.reduce((d, t) => ((t.matchDay ?? "") > d ? t.matchDay! : d), "");
  const featured = tickets.filter((t) => t.featured && t.matchDay === day);
  const anyLive = tickets.some((t) => t.live.some((m) => m?.state === "live" || m?.state === "paused"));
  return (
    <>
      {anyLive && <AutoRefresh seconds={60} />}
      {featured.length > 0 && (
        <section aria-labelledby="featured-title" className="mt-8">
          <SectionTitle>
            <span id="featured-title">À la une</span>
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {featured.map((t) => (
              <TicketCard key={t.id} ticket={t} stale={ageHours(t.generatedAt, new Date(now)) > STALE_AFTER_HOURS} now={now} defaultOpen />
            ))}
          </div>
        </section>
      )}
      <TicketsBrowser tickets={tickets} now={now} />
    </>
  );
}
