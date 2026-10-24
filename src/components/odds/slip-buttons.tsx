"use client";

import { Check, Plus, Star } from "lucide-react";
import { useFavorites, useSlip, toast } from "@/lib/store";
import { btn } from "@/components/ui/bits";
import type { Leg, Match } from "@/lib/types";

export function AddToSlip({ leg, compact = false, className = "" }: { leg: Leg; compact?: boolean; className?: string }) {
  const [legs, setLegs] = useSlip();
  const inSlip = legs.some((l) => l.matchId === leg.matchId && l.outcome === leg.outcome);
  const toggle = () => {
    setLegs((ls) =>
      inSlip ? ls.filter((l) => !(l.matchId === leg.matchId && l.outcome === leg.outcome)) : [...ls, leg],
    );
    toast(inSlip ? "Sélection retirée du ticket" : "Sélection ajoutée au ticket");
  };
  const label = inSlip ? `Retirer ${leg.label} du ticket` : `Ajouter ${leg.label} au ticket`;
  if (compact)
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={inSlip}
        aria-label={label}
        className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150 active:scale-95 ${
          inSlip ? "bg-accent text-accent-ink" : "bg-surface-2 text-text hover:bg-line"
        } ${className}`}
      >
        {inSlip ? <Check key="c" className="animate-pop size-[18px]" /> : <Plus className="size-[18px]" />}
      </button>
    );
  return (
    <button type="button" onClick={toggle} aria-pressed={inSlip} className={`${btn.base} ${inSlip ? btn.primary : btn.secondary} ${className}`}>
      {inSlip ? <Check key="c" className="animate-pop size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
      {inSlip ? "Dans le ticket" : "Ajouter au combiné"}
    </button>
  );
}

export function FollowMatch({ match, className = "" }: { match: Pick<Match, "id" | "kickoffAt" | "home" | "away">; className?: string }) {
  const [favs, setFavs] = useFavorites();
  const on = favs.matches.some((m) => m.id === match.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Ne plus suivre ce match" : "Suivre ce match"}
      onClick={() => {
        setFavs((f) => ({
          ...f,
          matches: on
            ? f.matches.filter((m) => m.id !== match.id)
            : [...f.matches, { id: match.id, label: `${match.home.name} – ${match.away.name}`, kickoffAt: match.kickoffAt }],
        }));
        toast(on ? "Match retiré des favoris" : "Match ajouté aux favoris");
      }}
      className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150 active:scale-95 ${className}`}
    >
      <Star className={`size-[18px] ${on ? "animate-pop fill-lime text-lime" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function FollowTeam({ team }: { team: { id: string; name: string } }) {
  const [favs, setFavs] = useFavorites();
  const on = favs.teams.some((t) => t.id === team.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setFavs((f) => ({ ...f, teams: on ? f.teams.filter((t) => t.id !== team.id) : [...f.teams, team] }));
        toast(on ? `${team.name} retiré des favoris` : `${team.name} ajouté aux favoris`);
      }}
      className={`${btn.base} min-h-9 rounded-full px-3 text-xs ${on ? "bg-white/15" : "bg-white/8 hover:bg-white/12"}`}
    >
      <Star className={`size-3.5 ${on ? "fill-lime text-lime" : ""}`} aria-hidden="true" />
      {team.name}
    </button>
  );
}
