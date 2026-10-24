import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Layers, SlidersHorizontal } from "lucide-react";
import { getTickets } from "@/lib/data";
import { CATEGORIES } from "@/lib/combos/generate";
import { ageHours, STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { categoryLabel, categoryTarget } from "@/lib/formatting";
import type { TicketCategory } from "@/lib/types";
import { TicketCard } from "@/components/combos/ticket-card";
import { btn, EmptyState } from "@/components/ui/bits";
import { ListSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Combinés" };

const ABOUT: Record<TicketCategory, string> = {
  moderate: "Deux ou trois sélections parmi les cotes les plus courtes. C'est la catégorie la moins incertaine, sans être sûre.",
  intermediate: "Plus de sélections, donc plus d'incertitude : chaque match ajouté réduit la probabilité que tout passe.",
  high: "Catégorie spéculative. Une cote élevée reflète une faible probabilité, pas une rentabilité.",
};

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
  const { tickets, now } = await getTickets();
  return (
    <div className="mt-8 space-y-10">
      {(Object.keys(CATEGORIES) as TicketCategory[]).map((c) => {
        const t = tickets.find((x) => x.category === c);
        return (
          <section key={c} aria-labelledby={`cat-${c}`} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-8">
            <div>
              <h2 id={`cat-${c}`} className="text-lg font-semibold tracking-tight">{categoryLabel[c]}</h2>
              <p className="text-sm font-medium text-muted">{categoryTarget[c]}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{ABOUT[c]}</p>
            </div>
            {t ? (
              <TicketCard ticket={t} stale={ageHours(t.generatedAt, new Date(now)) > STALE_AFTER_HOURS} defaultOpen />
            ) : (
              <EmptyState icon={Layers} title="Aucun combiné dans cette catégorie pour l'instant.">
                Les sélections admissibles ne permettent pas d&apos;atteindre cet objectif sans ajouter des matchs artificiellement.
              </EmptyState>
            )}
          </section>
        );
      })}
    </div>
  );
}
