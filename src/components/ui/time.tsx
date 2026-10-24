"use client";

import { useId } from "react";
import { useNow, useTimeZone } from "@/lib/store";

type Mode = "time" | "day" | "short" | "relative";

// Self-contained on purpose: its source is inlined into a pre-hydration script.
function fmt(iso: string, mode: string, tz: string, now: number): string {
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions = tz ? { timeZone: tz } : {};
  if (mode === "time") return d.toLocaleTimeString("fr-FR", Object.assign({ hour: "2-digit", minute: "2-digit" }, o));
  if (mode === "day")
    return d.toLocaleDateString("fr-FR", Object.assign({ weekday: "long", day: "numeric", month: "long" }, o));
  if (mode === "short" || !now)
    return d.toLocaleString(
      "fr-FR",
      Object.assign({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }, o),
    );
  const m = Math.round((now - d.getTime()) / 60000);
  if (Math.abs(m) < 1) return "à l’instant";
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(m) < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 48) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

const SERVER_TZ = "Europe/Paris";
/** JSON literal safe inside a <script>: `<` is escaped so data can't close the tag. */
const js = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Formats a timestamp in the user's time zone with no flash on load and no hydration error. */
export function Time({ iso, mode = "short", className }: { iso: string; mode?: Mode; className?: string }) {
  const id = useId();
  const [tz] = useTimeZone();
  const now = useNow();
  const text = now ? fmt(iso, mode, tz, now) : fmt(iso, mode, SERVER_TZ, 0);
  const script = `{var n=document.getElementById(${js(id)});if(n){var t="";try{t=JSON.parse(localStorage.getItem("vestra-tz")||'""')}catch(e){}n.textContent=(${fmt.toString()})(${js(iso)},${js(mode)},t,Date.now())}}`;
  return (
    <>
      <time id={id} dateTime={iso} className={className} suppressHydrationWarning>
        {text}
      </time>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: script }}
      />
    </>
  );
}
