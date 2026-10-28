"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookmarkPlus, ChevronDown, Copy, SlidersHorizontal } from "lucide-react";
import { ticketText } from "@/lib/combos/slip";
import { fmtOdds, fmtPct, fmtTotal, tierLabel } from "@/lib/formatting";
import { ticketLegs, toast, useFavorites, useSlip } from "@/lib/store";
import type { TicketStatus } from "@/lib/combos/display";
import type { LegResult } from "@/lib/combos/settle";
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

const STATUS: Record<LegResult, [string, string]> = {
  pending: ["En cours", "bg-white/10 text-hero-muted"],
  won: ["Gagné", "bg-accent text-accent-ink"],
  lost: ["Perdu", "bg-white/10 text-[#f87171]"],
  void: ["Annulé", "bg-white/10 text-hero-muted"],
};

function StatusPill({ status, leg = false }: { status: LegResult; leg?: boolean }) {
  const [label, cls] = STATUS[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{leg && status === "won" ? "Validé" : label}</span>;
}

const probabilityText = (p: number) => (p < 0.001 ? "< 0,1 %" : fmtPct(p * 100));

/** The ticket is the product's signature object: navy in both themes, total odds set large. */
export function TicketCard({ ticket, stale, defaultOpen = false }: { ticket: Ticket & Partial<TicketStatus>; stale: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [, setSlip] = useSlip();
  const [favs, setFavs] = useFavorites();
  const router = useRouter();
  const legs = ticketLegs(ticket);
  const saved = favs.tickets.some((t) => t.id === ticket.id);
  const panelId = `legs-${ticket.id}`;
  const status = ticket.status ?? ticket.result ?? "pending";
  // The slip builder only prices 1X2, so other markets cannot be adjusted there.
  const adjustable = ticket.legs.every((l) => l.market === "h2h");

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-hero text-hero-text">
      <div className="relative p-5">
        <div className="absolute inset-0 bg-[radial-gradient(80%_100%_at_100%_0%,rgb(200_241_105/0.14),transparent_60%)]" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              Combiné {tierLabel(ticket.tier)} <StatusPill status={status} />
            </h3>
            {ticket.probability !== null && (
              <p className="mt-1 max-w-[34ch] text-xs text-hero-muted">
                Probabilité selon le marché, si les matchs étaient indépendants : {probabilityText(ticket.probability)}
              </p>
            )}
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
          {ticket.legs.slice(0, open ? undefined : 3).map((l, i) => {
            const live = ticket.live?.[i];
            const score = live
              ? `${live.home.score ?? 0} - ${live.away.score ?? 0}`
              : l.matchState === "finished" && l.homeScore !== null ? `${l.homeScore} - ${l.awayScore}` : null;
            return (
            <li key={`${l.matchId}-${l.market}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{l.matchLabel}</span>
                <span className="font-semibold tabular-nums">{fmtOdds(l.odds)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-xs text-hero-muted">{l.label}</p>
                <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                  {score && <span className={live?.state === "live" ? "text-info" : "text-hero-muted"}>{live?.state === "live" ? "Direct " : ""}{score}</span>}
                  {ticket.legStatus && <StatusPill status={ticket.legStatus[i]} leg />}
                </span>
              </div>
              {open && <p className="mt-1 text-xs leading-relaxed text-hero-muted/90">{l.rationale}</p>}
            </li>
            );
          })}
        </ol>
        {open && (
          <p className="mt-4 rounded-[14px] bg-white/[0.06] p-3 text-xs leading-relaxed text-hero-muted">
            Chaque sélection ajoutée réduit la probabilité que toutes soient gagnantes. Aucune équipe n’apparaît deux fois ; les autres corrélations ne sont pas évaluées. Méthodologie v{ticket.methodologyVersion}.
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
          {adjustable && (
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
          )}
          <button
            type="button"
            aria-label={saved ? "Combiné enregistré" : "Enregistrer ce combiné"}
            title="Enregistrer"
            aria-pressed={saved}
            onClick={() => {
              if (saved) return;
              setFavs((f) => ({
                ...f,
                tickets: [...f.tickets, { id: ticket.id, title: `Combiné ${tierLabel(ticket.tier)}`, legs, savedAt: new Date().toISOString() }],
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
