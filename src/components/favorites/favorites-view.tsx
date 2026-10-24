"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Copy, Layers, Search, Star, Trash2, X } from "lucide-react";
import { ticketText } from "@/lib/combos/slip";
import { totalOdds } from "@/lib/odds/calc";
import { fmtOdds, fmtTotal } from "@/lib/formatting";
import { toast, useFavorites, useIsClient, useSlip } from "@/lib/store";
import { btn, card, EmptyState } from "@/components/ui/bits";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Time } from "@/components/ui/time";
import { copyText } from "@/components/combos/ticket-card";

type Tab = "teams" | "matches" | "tickets";
const TABS: [Tab, string][] = [["matches", "Matchs"], ["teams", "Équipes"], ["tickets", "Combinés"]];

export function FavoritesView() {
  const [favs, setFavs] = useFavorites();
  const [slip, setSlip] = useSlip();
  const [tab, setTab] = useState<Tab>("matches");
  const [q, setQ] = useState("");
  const router = useRouter();
  if (!useIsClient()) return null;

  const needle = q.trim().toLowerCase();
  const has = (s: string) => !needle || s.toLowerCase().includes(needle);
  const matches = favs.matches.filter((m) => has(m.label));
  const teams = favs.teams.filter((t) => has(t.name));
  const tickets = favs.tickets.filter((t) => has(t.title + t.legs.map((l) => l.matchLabel).join(" ")));

  return (
    <div>
      {slip.length > 0 && (
        <Link href="/combos/builder" className={`${card} mb-4 flex min-h-14 items-center justify-between px-4 text-sm`}>
          <span>Ticket en cours : {slip.length} sélection{slip.length > 1 ? "s" : ""}</span>
          <span className="font-semibold">Ouvrir</span>
        </Link>
      )}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher dans mes favoris"
          aria-label="Rechercher dans mes favoris"
          className="min-h-12 w-full rounded-[16px] border border-line bg-surface pr-4 pl-11 text-[15px] placeholder:text-muted focus:border-text/30 focus:outline-none"
        />
      </div>
      <div role="tablist" aria-label="Type de favori" className="mb-5 flex rounded-full border border-line bg-surface p-1">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-10 flex-1 rounded-full text-sm font-medium transition-colors duration-150 ${tab === k ? "bg-surface-2 text-text" : "text-muted"}`}
          >
            {l} <span className="tabular-nums text-muted">{{ matches: favs.matches, teams: favs.teams, tickets: favs.tickets }[k].length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "matches" &&
          (matches.length ? (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li key={m.id} className={`${card} flex items-center gap-3 p-2 pl-4`}>
                  <Link href={`/match/${m.id}`} className="min-w-0 flex-1 py-2">
                    <span className="block truncate font-medium">{m.label}</span>
                    <Time iso={m.kickoffAt} className="text-xs text-muted" />
                  </Link>
                  <button type="button" aria-label={`Retirer ${m.label}`} onClick={() => setFavs((f) => ({ ...f, matches: f.matches.filter((x) => x.id !== m.id) }))} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                    <X className="size-[18px]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarDays} title={needle ? "Aucun match ne correspond." : "Aucun match suivi."}>
              Touchez l&apos;étoile d&apos;une carte de match pour le retrouver ici.
            </EmptyState>
          ))}

        {tab === "teams" &&
          (teams.length ? (
            <ul className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setFavs((f) => ({ ...f, teams: f.teams.filter((x) => x.id !== t.id) }))} className={`${btn.base} ${btn.secondary} rounded-full`} aria-label={`Retirer ${t.name}`}>
                    <Star className="size-4 fill-current" aria-hidden="true" /> {t.name} <X className="size-4 text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Star} title={needle ? "Aucune équipe ne correspond." : "Aucune équipe favorite."}>
              Ajoutez une équipe depuis la fiche d&apos;un match.
            </EmptyState>
          ))}

        {tab === "tickets" &&
          (tickets.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {tickets.map((t) => {
                const total = totalOdds(t.legs.map((l) => l.odds));
                return (
                  <li key={t.id} className={`${card} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{t.title}</p>
                        <p className="text-xs text-muted">
                          Enregistré <Time iso={t.savedAt} mode="relative" />. Cotes de l&apos;époque.
                        </p>
                      </div>
                      <span className="text-2xl font-semibold tabular-nums">{total ? fmtTotal(total) : "–"}</span>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm">
                      {t.legs.map((l) => (
                        <li key={`${l.matchId}-${l.outcome}`} className="flex justify-between gap-3">
                          <span className="truncate text-muted">{l.matchLabel}, {l.label}</span>
                          <span className="tabular-nums">{fmtOdds(l.odds)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setSlip(t.legs); toast("Combiné chargé dans votre ticket"); router.push("/combos/builder"); }} className={`${btn.base} ${btn.primary} flex-1`}>
                        Charger et vérifier
                      </button>
                      <button type="button" aria-label="Copier" onClick={() => copyText(ticketText(t.legs, total))} className={`${btn.base} ${btn.secondary} px-3`}>
                        <Copy className="size-4" aria-hidden="true" />
                      </button>
                      <ConfirmButton onConfirm={() => setFavs((f) => ({ ...f, tickets: f.tickets.filter((x) => x.id !== t.id) }))} confirmLabel="Supprimer ?" className="px-3">
                        <Trash2 className="size-4" aria-label="Supprimer" />
                      </ConfirmButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Layers} title={needle ? "Aucun combiné ne correspond." : "Aucun combiné enregistré."}>
              Utilisez le bouton d&apos;enregistrement sur un combiné ou sur votre ticket.
            </EmptyState>
          ))}
      </div>
    </div>
  );
}
