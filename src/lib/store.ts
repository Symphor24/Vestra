"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Leg, Ticket } from "@/lib/types";

// Per-device storage only: no server persistence until auth + RLS exist (cahier des charges §4.6).
const EVENT = "vestra-store";
const cache = new Map<string, { raw: string | null; value: unknown }>();

// Legs saved before multi-market tickets have no market: they were all 1X2.
const withMarket = (_: string, v: unknown) =>
  v && typeof v === "object" && "matchId" in v && "outcome" in v && !("market" in v) ? { ...v, market: "h2h" } : v;

function read<T>(key: string, initial: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw, withMarket) as T;
    } catch {}
  }
  cache.set(key, { raw, value });
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** `initial` must be a stable (module-level) value. */
export function useStored<T>(key: string, initial: T) {
  const value = useSyncExternalStore(subscribe, () => read(key, initial), () => initial);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(read(key, initial)) : next;
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key, initial],
  );
  return [value, set] as const;
}

const noopSubscribe = () => () => {};
/** false during SSR and hydration, true afterwards: lets client-only values render without mismatches. */
export const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

const subscribeClock = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;
/** Current time rounded to the minute, ticking; 0 during SSR and hydration. */
export const useNow = () => useSyncExternalStore(subscribeClock, minuteNow, () => 0);

export type Theme = "system" | "light" | "dark";
export type SavedTicket = { id: string; title: string; legs: Leg[]; savedAt: string };
export interface Favorites {
  teams: { id: string; name: string }[];
  matches: { id: string; label: string; kickoffAt: string }[];
  tickets: SavedTicket[];
}

const NO_LEGS: Leg[] = [];
const NO_FAVS: Favorites = { teams: [], matches: [], tickets: [] };
const NO_COMPS: string[] = [];

export const useSlip = () => useStored("vestra-slip", NO_LEGS);
export const useFavorites = () => useStored("vestra-favs", NO_FAVS);
export const useTheme = () => useStored<Theme>("vestra-theme", "system");
export const useTimeZone = () => useStored("vestra-tz", "");
export const useFavoriteCompetitions = () => useStored("vestra-comps", NO_COMPS);

export const ticketLegs = (t: Ticket): Leg[] =>
  t.legs.map(({ matchId, market, outcome, odds, observedAt, label, matchLabel }) => ({
    matchId, market, outcome, odds, observedAt, label, matchLabel,
  }));

export function toast(message: string, tone: "ok" | "error" = "ok") {
  window.dispatchEvent(new CustomEvent("vestra-toast", { detail: { message, tone } }));
}

export function clearLocalData() {
  try {
    ["vestra-slip", "vestra-favs", "vestra-theme", "vestra-tz", "vestra-comps", "vestra-onboarded"].forEach((k) =>
      localStorage.removeItem(k),
    );
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
