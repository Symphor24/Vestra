"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, X } from "lucide-react";
import { selectionSignal } from "@/lib/odds/calc";
import { useFavoriteCompetitions, useIsClient, useTimeZone } from "@/lib/store";
import { OUTCOMES, type Competition, type Match } from "@/lib/types";
import { EmptyState } from "@/components/ui/bits";
import { MatchCard } from "./match-card";

type DateFilter = "all" | "today" | "tomorrow" | "week";
type StatusFilter = "scheduled" | "finished";
type Sort = "time" | "competition" | "movement";

const DATES: [DateFilter, string][] = [["all", "Toutes dates"], ["today", "Aujourd'hui"], ["tomorrow", "Demain"], ["week", "7 jours"]];
const SORTS: [Sort, string][] = [["time", "Heure"], ["competition", "Compétition"], ["movement", "Mouvement de cote"]];

/** YYYY-MM-DD in the given zone (en-CA formats dates that way). */
const dayKey = (iso: string | number, tz: string) =>
  new Date(iso).toLocaleDateString("en-CA", tz ? { timeZone: tz } : {});

const maxMove = (m: Match, now: Date) =>
  Math.max(...OUTCOMES.map((o) => Math.abs(selectionSignal(m.h2h[o], now).changePct ?? 0)));

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

export function MatchesBrowser({ matches, competitions, now }: { matches: Match[]; competitions: Competition[]; now: string }) {
  const [q, setQ] = useState("");
  const [comp, setComp] = useState<string | null>(null);
  const [date, setDate] = useState<DateFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("scheduled");
  const [sort, setSort] = useState<Sort>("time");
  const [storedTz] = useTimeZone();
  const [favComps] = useFavoriteCompetitions();
  const isClient = useIsClient();
  const tz = isClient ? storedTz : "Europe/Paris";

  const groups = useMemo(() => {
    const nowD = new Date(now);
    const today = dayKey(now, tz);
    const tomorrow = dayKey(nowD.getTime() + 86_400_000, tz);
    const weekEnd = nowD.getTime() + 7 * 86_400_000;
    const needle = q.trim().toLowerCase();
    const list = matches.filter((m) => {
      if (m.status !== status) return false;
      if (comp === "fav" ? !favComps.includes(m.competition.id) : comp && m.competition.id !== comp) return false;
      if (needle && !`${m.home.name} ${m.away.name} ${m.home.shortName} ${m.away.shortName}`.toLowerCase().includes(needle)) return false;
      const k = dayKey(m.kickoffAt, tz);
      if (date === "today") return k === today;
      if (date === "tomorrow") return k === tomorrow;
      if (date === "week") return Date.parse(m.kickoffAt) <= weekEnd;
      return true;
    });
    const byTime = (a: Match, b: Match) => (status === "finished" ? -1 : 1) * a.kickoffAt.localeCompare(b.kickoffAt);
    if (sort === "movement") return [{ key: "Plus forts mouvements", items: list.sort((a, b) => maxMove(b, nowD) - maxMove(a, nowD)), day: null }];
    const keyOf = (m: Match) => (sort === "competition" ? m.competition.name : dayKey(m.kickoffAt, tz));
    const map = new Map<string, Match[]>();
    for (const m of list.sort(byTime)) map.set(keyOf(m), [...(map.get(keyOf(m)) ?? []), m]);
    return [...map].sort(([a], [b]) => (sort === "competition" ? a.localeCompare(b) : 0)).map(([key, items]) => ({
      key,
      items,
      day: sort === "time" ? items[0].kickoffAt : null,
    }));
  }, [matches, now, q, comp, date, status, sort, tz, favComps]);

  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const filtered = q || comp || date !== "all";

  return (
    <div>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une équipe"
            aria-label="Rechercher une équipe"
            className="min-h-12 w-full rounded-[16px] border border-line bg-surface pr-4 pl-11 text-[15px] placeholder:text-muted focus:border-text/30 focus:outline-none"
          />
        </div>

        <div className="no-scrollbar relative -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Compétition">
          <Chip on={comp === null} onClick={() => setComp(null)}>Toutes</Chip>
          {favComps.length > 0 && (
            <Chip on={comp === "fav"} onClick={() => setComp(comp === "fav" ? null : "fav")}>Mes compétitions</Chip>
          )}
          {competitions.map((c) => (
            <Chip key={c.id} on={comp === c.id} onClick={() => setComp(comp === c.id ? null : c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Statut">
            {(["scheduled", "finished"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`min-h-9 rounded-full px-3.5 text-sm font-medium transition-colors duration-150 ${status === s ? "bg-surface-2 text-text" : "text-muted"}`}
              >
                {s === "scheduled" ? "À venir" : "Terminés"}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="date-filter">Date</label>
          <select id="date-filter" value={date} onChange={(e) => setDate(e.target.value as DateFilter)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm">
            {DATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="sr-only" htmlFor="sort">Trier par</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm">
            {SORTS.map(([v, l]) => <option key={v} value={v}>Tri : {l}</option>)}
          </select>
        </div>

        <p className="flex min-h-9 items-center justify-between text-sm text-muted" aria-live="polite">
          <span>{count} match{count > 1 ? "s" : ""}</span>
          {filtered && (
            <button type="button" onClick={() => { setQ(""); setComp(null); setDate("all"); }} className="inline-flex min-h-9 items-center gap-1 font-medium text-text">
              <X className="size-4" aria-hidden="true" /> Effacer les filtres
            </button>
          )}
        </p>
      </div>

      {count === 0 ? (
        <div className="mt-2">
          <EmptyState icon={SearchX} title="Aucun match ne correspond à ces filtres.">
            {status === "finished" ? "Les matchs terminés apparaissent ici après la synchronisation." : "Élargissez la date ou retirez un filtre."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-2 space-y-7">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-3 text-sm font-semibold text-muted first-letter:uppercase">
                {g.day
                  ? new Date(g.day).toLocaleDateString("fr-FR", { ...(tz ? { timeZone: tz } : {}), weekday: "long", day: "numeric", month: "long" })
                  : g.key}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {g.items.map((m) => <MatchCard key={m.id} match={m} now={now} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
