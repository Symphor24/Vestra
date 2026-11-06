"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import type { DisplayTicket } from "@/lib/data";
import { ageHours, STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { tierLabel } from "@/lib/formatting";
import { TIERS, type Tier } from "@/lib/combos/tiers";
import { EmptyState, SectionTitle } from "@/components/ui/bits";
import { TicketCard } from "./ticket-card";

type Tab = "pending" | "won" | "lost";
const TABS: [Tab, string][] = [["pending", "En cours"], ["won", "Validés"], ["lost", "Perdus"]];
const EMPTY: Record<Tab, string> = { pending: "en cours", won: "validé", lost: "perdu" };

// Annulé tickets sit with the lost ones.
const tabOf = (t: DisplayTicket): Tab => (t.status === "pending" ? "pending" : t.status === "won" ? "won" : "lost");
const newestFirst = (a: DisplayTicket, b: DisplayTicket) => (b.matchDay ?? "").localeCompare(a.matchDay ?? "") || a.tier - b.tier;

// matchDay is a UTC date: formatted in UTC so server and browser agree.
const dayLabel = (d: string | null, today: string) =>
  d === null ? "Sans date" : d === today ? "Aujourd’hui" : new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(/ 1 /, " 1er ");

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${
        on ? "border-transparent bg-text text-bg" : "border-line bg-surface text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/** `day` is the day whose featured tickets start open at the top of the list. */
export function TicketsBrowser({ tickets, now, day }: { tickets: DisplayTicket[]; now: string; day: string }) {
  const [tab, setTab] = useState<Tab>(tickets.some((t) => tabOf(t) === "pending") ? "pending" : "won");
  const [tier, setTier] = useState<Tier | null>(null);
  const nowD = new Date(now);

  const inTab = tickets.filter((t) => tabOf(t) === tab).sort(newestFirst);
  const days = [...new Set(inTab.map((t) => t.matchDay))];
  // One day is a handful of rows already sorted by tier: the filter only helps across several days.
  const tiers = days.length > 1 ? TIERS.filter((t) => inTab.some((x) => x.tier === t)) : [];
  const shown = tier === null ? inTab : inTab.filter((t) => t.tier === tier);

  return (
    <>
      <div className="mt-8 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Statut des combinés">
        {TABS.map(([k, label]) => (
          <Chip
            key={k}
            on={tab === k}
            onClick={() => {
              setTab(k);
              setTier(null);
            }}
          >
            {label} ({tickets.filter((t) => tabOf(t) === k).length})
          </Chip>
        ))}
      </div>
      {tiers.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Palier de cote">
          <Chip on={tier === null} onClick={() => setTier(null)}>Tous</Chip>
          {tiers.map((t) => (
            <Chip key={t} on={tier === t} onClick={() => setTier(t)}>
              {tierLabel(t)}
            </Chip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Layers} title={`Aucun combiné ${EMPTY[tab]} pour l'instant.`} />
        </div>
      ) : (
        days.map((d) => {
          const list = shown.filter((t) => t.matchDay === d);
          return (
            list.length > 0 && (
              <section key={d} className="mt-8">
                <SectionTitle>
                  <span className="inline-block first-letter:uppercase">{dayLabel(d, now.slice(0, 10))}</span>
                </SectionTitle>
                <div className="space-y-2">
                  {list.map((t) => (
                    <TicketCard
                      key={t.id}
                      ticket={t}
                      stale={ageHours(t.generatedAt, nowD) > STALE_AFTER_HOURS}
                      now={now}
                      collapsible
                      startExpanded={tab === "pending" && t.featured && t.matchDay === day}
                    />
                  ))}
                </div>
              </section>
            )
          );
        })
      )}
    </>
  );
}
