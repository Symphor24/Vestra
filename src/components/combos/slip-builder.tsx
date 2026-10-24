"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { BookmarkPlus, Copy, Info, RefreshCw, Ticket, Trash2, TriangleAlert, X } from "lucide-react";
import { reviewSlip, ticketText } from "@/lib/combos/slip";
import { fmtOdds, fmtPct, fmtTotal } from "@/lib/formatting";
import { toast, useFavorites, useIsClient, useSlip } from "@/lib/store";
import type { Match } from "@/lib/types";
import { btn, card, EmptyState } from "@/components/ui/bits";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { copyText } from "./ticket-card";

export function SlipBuilder({ matches, now }: { matches: Match[]; now: string }) {
  const [legs, setLegs] = useSlip();
  const [, setFavs] = useFavorites();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const isClient = useIsClient();
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const r = useMemo(() => reviewSlip(legs, byId, new Date(now)), [legs, byId, now]);

  if (!isClient) return null; // the slip lives in this browser only
  if (legs.length === 0)
    return (
      <EmptyState icon={Ticket} title="Votre ticket est vide.">
        <p>Ajoutez des sélections depuis une fiche match ou personnalisez un combiné proposé.</p>
        <Link href="/matches" className={`${btn.base} ${btn.primary} mt-4`}>Parcourir les matchs</Link>
      </EmptyState>
    );

  const blocked = r.conflicts.size > 0 || r.moved.size > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <ol className="space-y-2.5" aria-label="Sélections du ticket">
        {legs.map((l, i) => {
          const conflict = r.conflicts.has(l.matchId);
          const moved = r.moved.get(i);
          return (
            <li key={`${l.matchId}-${l.outcome}`} className={`${card} animate-rise flex items-center gap-3 p-4 ${conflict ? "border-danger/60" : ""}`}>
              <div className="min-w-0 flex-1">
                <Link href={`/match/${l.matchId}`} className="block truncate text-sm text-muted hover:text-text">{l.matchLabel}</Link>
                <p className="truncate font-semibold">{l.label}</p>
                {conflict && <p className="mt-1 flex items-center gap-1 text-xs text-danger"><TriangleAlert className="size-3.5" aria-hidden="true" /> Incompatible : deux issues du même match</p>}
                {r.stale.has(i) && <p className="mt-1 flex items-center gap-1 text-xs text-warn"><TriangleAlert className="size-3.5" aria-hidden="true" /> Cote ancienne ou match plus disponible</p>}
                {moved !== undefined && (
                  <p className="mt-1 text-xs text-info tabular-nums">Cote actuelle {fmtOdds(moved)} (ajoutée à {fmtOdds(l.odds)})</p>
                )}
              </div>
              <span className="text-xl font-semibold tabular-nums">{fmtOdds(l.odds)}</span>
              <button
                type="button"
                aria-label={`Retirer ${l.label}`}
                onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="size-[18px]" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        <li>
          <Link href="/matches" className="flex min-h-12 items-center justify-center rounded-card border border-dashed border-line text-sm font-medium text-muted hover:text-text">
            Ajouter une sélection
          </Link>
        </li>
      </ol>

      <aside className="rounded-card bg-hero p-5 text-hero-text lg:sticky lg:top-8" aria-label="Résumé du ticket">
        <p className="text-sm text-hero-muted">
          {r.count} sélection{r.count > 1 ? "s" : ""}, marché 1N2
        </p>
        <p className="mt-3 text-[11px] text-hero-muted">Cote totale théorique</p>
        <p key={r.total ?? 0} className="animate-pop origin-left text-[44px] leading-none font-semibold tracking-[-0.04em] tabular-nums" aria-live="polite">
          {r.total && !r.conflicts.size ? fmtTotal(r.total) : "–"}
        </p>
        {r.conflicts.size > 0 && <p className="mt-1 text-sm text-[#fca5a5]">Ticket incompatible, cote non calculée.</p>}
        <p className="mt-4 text-sm text-hero-muted">
          {r.probabilityIfIndependent !== null ? (
            <>
              Probabilité implicite du marché, si les matchs étaient indépendants :{" "}
              <span className="font-semibold text-hero-text tabular-nums">{fmtPct(r.probabilityIfIndependent * 100, r.probabilityIfIndependent < 0.01 ? 2 : 1)}</span>
            </>
          ) : (
            "Probabilité indicative indisponible : il faut au moins deux sélections compatibles avec un marché complet."
          )}
        </p>
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-hero-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Les corrélations entre matchs différents ne sont pas évaluées. Le produit des cotes suppose l&apos;indépendance.
        </p>

        {r.moved.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setLegs((ls) => ls.map((l, i) => (r.moved.has(i) ? { ...l, odds: r.moved.get(i)!, observedAt: byId.get(l.matchId)!.h2h[l.outcome].at(-1)!.observedAt } : l)));
              toast("Cotes mises à jour");
            }}
            className={`${btn.base} mt-5 w-full bg-white/10 hover:bg-white/15`}
          >
            Appliquer les cotes actuelles ({r.moved.size})
          </button>
        )}

        <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-2">
          <button
            type="button"
            disabled={blocked}
            onClick={() => copyText(ticketText(legs, r.total))}
            className={`${btn.base} bg-lime text-midnight hover:brightness-95`}
          >
            <Copy className="size-4" aria-hidden="true" /> Copier le ticket
          </button>
          <button
            type="button"
            aria-label="Vérifier les cotes"
            title="Vérifier les cotes"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            className="grid size-11 place-items-center rounded-btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Enregistrer ce ticket"
            title="Enregistrer"
            onClick={() => {
              setFavs((f) => ({ ...f, tickets: [...f.tickets, { id: `perso-${Date.now()}`, title: "Mon combiné", legs, savedAt: new Date().toISOString() }] }));
              toast("Ticket enregistré dans vos favoris");
            }}
            className="grid size-11 place-items-center rounded-btn bg-white/10 hover:bg-white/15"
          >
            <BookmarkPlus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {blocked && (
          <p className="mt-2 text-xs text-[#f5b33d]">
            {r.conflicts.size ? "Retirez les sélections incompatibles pour copier." : "Les cotes ont changé : appliquez-les avant de copier."}
          </p>
        )}
        <ConfirmButton onConfirm={() => setLegs([])} confirmLabel="Vider le ticket ?" className="mt-3 w-full">
          <Trash2 className="size-4" aria-hidden="true" /> Vider le ticket
        </ConfirmButton>
      </aside>
    </div>
  );
}
