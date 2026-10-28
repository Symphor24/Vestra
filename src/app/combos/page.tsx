import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Layers, SlidersHorizontal } from "lucide-react";
import { getTicketBoard } from "@/lib/data";
import { ageHours, STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { TicketCard } from "@/components/combos/ticket-card";
import { btn, EmptyState } from "@/components/ui/bits";
import { ListSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Combinés" };

export default function CombosPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Combinés</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Construits automatiquement à partir des cotes en baisse. Les cotes visées sont des objectifs : si aucune combinaison honnête ne les atteint, la catégorie reste vide.
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
  const day = tickets[0]?.matchDay;
  const shown = tickets.filter((t) => t.matchDay === day);
  if (shown.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState icon={Layers} title="Aucun combiné pour l'instant.">
          Les sélections admissibles ne permettent pas de construire un combiné sans ajouter des matchs artificiellement.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {shown.map((t) => (
        <TicketCard key={t.id} ticket={t} stale={ageHours(t.generatedAt, new Date(now)) > STALE_AFTER_HOURS} defaultOpen />
      ))}
    </div>
  );
}
