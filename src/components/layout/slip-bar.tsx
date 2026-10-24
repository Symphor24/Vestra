"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ticket } from "lucide-react";
import { totalOdds } from "@/lib/odds/calc";
import { fmtTotal } from "@/lib/formatting";
import { useSlip } from "@/lib/store";

/** Floating summary of the ticket being built, so the total is always one tap away. */
export function SlipBar() {
  const [legs] = useSlip();
  const path = usePathname();
  if (legs.length === 0 || path === "/combos/builder") return null;
  const conflict = new Set(legs.map((l) => l.matchId)).size < legs.length;
  const total = conflict ? null : totalOdds(legs.map((l) => l.odds));
  return (
    <Link
      href="/combos/builder"
      className="animate-rise fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-[20px] bg-hero px-4 py-3 text-hero-text shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-80"
    >
      <span className="grid size-9 place-items-center rounded-full bg-lime text-midnight">
        <Ticket className="size-4" aria-hidden="true" />
      </span>
      <span className="flex-1 text-sm">
        <span className="block font-semibold">Mon ticket</span>
        <span className={conflict ? "text-[#fca5a5]" : "text-hero-muted"}>
          {conflict ? "Sélections incompatibles" : `${legs.length} sélection${legs.length > 1 ? "s" : ""}`}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[11px] text-hero-muted">Cote totale</span>
        <span key={total} className="animate-pop inline-block text-lg font-semibold tabular-nums">
          {total ? fmtTotal(total) : "–"}
        </span>
      </span>
    </Link>
  );
}
