import type { LucideIcon } from "lucide-react";
import { Clock, Minus, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { fmtSignedPct } from "@/lib/formatting";
import type { Team } from "@/lib/types";
import { Time } from "./time";

export const btn = {
  base: "inline-flex min-h-11 items-center justify-center gap-2 rounded-btn px-4 text-sm font-semibold transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
  primary: "bg-accent text-accent-ink hover:brightness-95",
  secondary: "bg-surface-2 text-text hover:bg-line",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger/12 text-danger hover:bg-danger/20",
};

export const card = "rounded-card border border-line bg-surface";

/** Initials stand in for crests until a licensed crest source is wired. */
export function TeamBadge({ team, size = "md", onHero = false }: { team: Team; size?: "sm" | "md" | "lg"; onHero?: boolean }) {
  const initials = team.shortName.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  const s = { sm: "size-7 text-[10px]", md: "size-9 text-[11px]", lg: "size-14 text-sm" }[size];
  return (
    <span
      aria-hidden="true"
      className={`${s} grid shrink-0 place-items-center rounded-full border font-semibold tracking-tight ${onHero ? "border-white/15 bg-white/10 text-white" : "border-line bg-surface-2"}`}
    >
      {initials}
    </span>
  );
}

/**
 * Price movement since Vestra's first observation. Shortening is shown in blue, never green:
 * a falling price is information, not a sign that a bet will win.
 */
export function OddsDelta({ changePct, className = "" }: { changePct: number | null; className?: string }) {
  if (changePct === null)
    return <span className={`text-xs text-muted ${className}`}>Historique insuffisant</span>;
  const [Icon, tone, word]: [LucideIcon, string, string] =
    Math.abs(changePct) < 0.5 ? [Minus, "text-muted", "stable"] : changePct < 0 ? [TrendingDown, "text-info", "en baisse"] : [TrendingUp, "text-muted", "en hausse"];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap tabular-nums ${tone} ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {fmtSignedPct(changePct)}
      <span className="sr-only"> ({word} depuis la première observation)</span>
    </span>
  );
}

export function Freshness({ iso, ageHours }: { iso: string; ageHours: number | null }) {
  const stale = ageHours === null || ageHours > STALE_AFTER_HOURS;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${stale ? "text-warn" : "text-muted"}`}>
      {stale ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <Clock className="size-3.5" aria-hidden="true" />}
      {stale ? "Cote à vérifier, observée " : "Observée "}
      <Time iso={iso} mode="relative" />
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className={`${card} flex flex-col items-center px-6 py-10 text-center`}>
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-surface-2">
        <Icon className="size-5 text-muted" aria-hidden="true" />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
