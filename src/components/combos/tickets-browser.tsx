"use client";

import { useRef, useState } from "react";
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
const PINNED_MAX = 6;

// Annulé tickets sit with the lost ones.
const tabOf = (t: DisplayTicket): Tab => (t.status === "pending" ? "pending" : t.status === "won" ? "won" : "lost");
const newestFirst = (a: DisplayTicket, b: DisplayTicket) => (b.matchDay ?? "").localeCompare(a.matchDay ?? "") || a.tier - b.tier;

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

export function TicketsBrowser({ tickets, now }: { tickets: DisplayTicket[]; now: string }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [tier, setTier] = useState<Tier | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const nowD = new Date(now);
  const card = (t: DisplayTicket) => <TicketCard key={t.id} ticket={t} stale={ageHours(t.generatedAt, nowD) > STALE_AFTER_HOURS} now={now} />;

  const won = tickets.filter((t) => t.status === "won").sort(newestFirst);
  const shown = tickets.filter((t) => tabOf(t) === tab && (tier === null || t.tier === tier)).sort(newestFirst);

  return (
    <>
      {tab !== "won" && won.length > 0 && (
        <section aria-labelledby="won-title" className="mt-10">
          <SectionTitle
            action={
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-muted hover:text-text"
                onClick={() => {
                  setTab("won");
                  tabsRef.current?.scrollIntoView({ block: "start" });
                }}
              >
                Voir tout ({won.length})
              </button>
            }
          >
            <span id="won-title">Validés</span>
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">{won.slice(0, PINNED_MAX).map(card)}</div>
        </section>
      )}

      <div ref={tabsRef} className="mt-10 scroll-mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Statut des combinés">
          {TABS.map(([k, label]) => (
            <Chip key={k} on={tab === k} onClick={() => setTab(k)}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Palier de cote">
          <Chip on={tier === null} onClick={() => setTier(null)}>Tous</Chip>
          {TIERS.map((t) => (
            <Chip key={t} on={tier === t} onClick={() => setTier(t)}>
              {tierLabel(t)}
            </Chip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Layers} title={tier === null ? `Aucun combiné ${EMPTY[tab]} pour l'instant.` : `Aucun combiné ${tierLabel(tier)} ${EMPTY[tab]} pour l'instant.`} />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">{shown.map(card)}</div>
      )}
    </>
  );
}
