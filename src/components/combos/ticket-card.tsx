"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookmarkPlus, ChevronDown, Copy, SlidersHorizontal } from "lucide-react";
import { ticketText } from "@/lib/combos/slip";
import { categoryLabel, categoryTarget, fmtOdds, fmtTotal, MARKET_LABEL } from "@/lib/formatting";
import { ticketLegs, toast, useFavorites, useSlip } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { btn } from "@/components/ui/bits";
import { Time } from "@/components/ui/time";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Ticket copié");
  } catch {
    toast("Copie impossible : autorisez l'accès au presse-papiers", "error");
  }
}

const RISK_NOTE = {
  moderate: "Peu de sélections : le cumul d'incertitude reste limité, sans être nul.",
  intermediate: "Chaque sélection ajoutée réduit la probabilité que toutes soient gagnantes.",
  high: "Combiné spéculatif : la probabilité que toutes les sélections passent est très faible.",
};

/** The ticket is the product's signature object: navy in both themes, total odds set large. */
export function TicketCard({ ticket, stale, defaultOpen = false }: { ticket: Ticket; stale: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [, setSlip] = useSlip();
  const [favs, setFavs] = useFavorites();
  const router = useRouter();
  const legs = ticketLegs(ticket);
  const saved = favs.tickets.some((t) => t.id === ticket.id);
  const panelId = `legs-${ticket.category}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-hero text-hero-text">
      <div className="relative p-5">
        <div className="absolute inset-0 bg-[radial-gradient(80%_100%_at_100%_0%,rgb(200_241_105/0.14),transparent_60%)]" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{categoryLabel[ticket.category]}</h3>
            <p className="text-xs text-hero-muted">{categoryTarget[ticket.category]}</p>
          </div>
          <p className="text-right">
            <span className="block text-[11px] text-hero-muted">Cote totale théorique</span>
            <span className="text-[34px] leading-none font-semibold tracking-tight tabular-nums">{fmtTotal(ticket.totalOdds)}</span>
          </p>
        </div>
        <p className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-hero-muted">
          <span>{ticket.legs.length} sélections</span>
          <span>
            Générée <Time iso={ticket.generatedAt} mode="relative" />
          </span>
          <span className={stale ? "text-[#f5b33d]" : ""}>{stale ? "Cotes à revérifier" : "Cotes récentes"}</span>
        </p>
      </div>

      {/* Perforation between stub and body */}
      <div className="relative h-0 border-t border-dashed border-white/15" aria-hidden="true">
        <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full bg-bg" />
        <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full bg-bg" />
      </div>

      <div className="flex flex-1 flex-col p-5 pt-4">
        <ol id={panelId} className="space-y-2.5">
          {ticket.legs.slice(0, open ? undefined : 3).map((l) => (
            <li key={l.matchId} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{l.matchLabel}</span>
                <span className="font-semibold tabular-nums">{fmtOdds(l.odds)}</span>
              </div>
              <p className="text-xs text-hero-muted">{l.label}</p>
              {open && <p className="mt-1 text-xs leading-relaxed text-hero-muted/90">{l.rationale}</p>}
            </li>
          ))}
        </ol>
        {open && (
          <p className="mt-4 rounded-[14px] bg-white/[0.06] p-3 text-xs leading-relaxed text-hero-muted">
            {MARKET_LABEL}. {RISK_NOTE[ticket.category]} Aucune équipe n’apparaît deux fois ; les autres corrélations ne sont pas évaluées. Méthodologie v{ticket.methodologyVersion}.
          </p>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="mt-3 inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-lime"
        >
          {open ? "Réduire" : "Voir le ticket"}
          <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>

        <div className="mt-auto flex gap-2 pt-3">
          <button type="button" onClick={() => copyText(ticketText(legs, ticket.totalOdds))} className={`${btn.base} flex-1 bg-lime text-midnight hover:brightness-95`}>
            <Copy className="size-4" aria-hidden="true" /> Copier le ticket
          </button>
          <button
            type="button"
            aria-label="Personnaliser ce combiné"
            title="Personnaliser"
            onClick={() => {
              setSlip(legs);
              router.push("/combos/builder");
            }}
            className="grid size-11 place-items-center rounded-btn bg-white/10 hover:bg-white/15"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={saved ? "Combiné enregistré" : "Enregistrer ce combiné"}
            title="Enregistrer"
            aria-pressed={saved}
            onClick={() => {
              if (saved) return;
              setFavs((f) => ({
                ...f,
                tickets: [...f.tickets, { id: ticket.id, title: `Combiné ${categoryLabel[ticket.category].toLowerCase()}`, legs, savedAt: new Date().toISOString() }],
              }));
              toast("Combiné enregistré dans vos favoris");
            }}
            className={`grid size-11 place-items-center rounded-btn ${saved ? "bg-lime text-midnight" : "bg-white/10 hover:bg-white/15"}`}
          >
            <BookmarkPlus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
