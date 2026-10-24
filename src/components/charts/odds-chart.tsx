"use client";

import { useEffect, useRef, useState } from "react";
import { fmtOdds } from "@/lib/formatting";
import { useIsClient, useTimeZone } from "@/lib/store";
import type { OddsPoint } from "@/lib/types";

const H = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 44 };

/** Hand-rolled SVG line (one series, one axis): lighter than a chart library for 2–20 points. */
export function OddsChart({ points, label }: { points: OddsPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so axis text stays 12px on phones instead of shrinking with a viewBox.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [storedTz] = useTimeZone();
  const tz = useIsClient() ? storedTz : "Europe/Paris";
  const fmtT = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", { ...(tz ? { timeZone: tz } : {}), day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const ts = points.map((p) => Date.parse(p.observedAt));
  const vals = points.map((p) => p.odds);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.1);
  const y0 = lo - span * 0.25;
  const y1 = hi + span * 0.25;
  const t0 = ts[0];
  const t1 = Math.max(ts.at(-1)!, t0 + 1);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((y1 - y0) * (i + 0.5)) / 4);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.odds).toFixed(1)}`).join(" ");
  const h = hover !== null ? points[hover] : null;

  return (
    <figure>
      <div ref={box} className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full touch-none overflow-visible text-text"
          role="img"
          aria-label={`Évolution de la cote ${label} : de ${fmtOdds(vals[0])} à ${fmtOdds(vals.at(-1)!)} sur ${points.length} observations`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            ts.forEach((t, i) => Math.abs(x(t) - px) < Math.abs(x(ts[best]) - px) && (best = i));
            setHover(best);
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth="1" />
              <text x={PAD.left - 10} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[12px] tabular-nums">
                {v.toFixed(2)}
              </text>
            </g>
          ))}
          {[0, points.length - 1].map((i) => (
            <text key={i} x={x(ts[i])} y={H - 8} textAnchor={i ? "end" : "start"} className="fill-muted text-[12px]">
              {fmtT(points[i].observedAt)}
            </text>
          ))}
          {h && <line x1={x(ts[hover!])} x2={x(ts[hover!])} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted" strokeDasharray="3 3" />}
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={p.observedAt} cx={x(ts[i])} cy={y(p.odds)} r={hover === i ? 6 : 4} className="fill-surface" stroke="currentColor" strokeWidth="2" />
          ))}
          {/* Direct label on the latest value only */}
          <text x={x(ts.at(-1)!)} y={y(vals.at(-1)!) - 12} textAnchor="end" className="fill-text text-[13px] font-semibold tabular-nums">
            {fmtOdds(vals.at(-1)!)}
          </text>
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${(x(ts[hover!]) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? "-105%" : "5%"})` }}
          >
            <span className="block font-semibold tabular-nums">{fmtOdds(h.odds)}</span>
            <span className="text-muted">{fmtT(h.observedAt)}</span>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-muted hover:text-text">Voir les valeurs</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-1.5 font-medium">Observation</th>
              <th scope="col" className="py-1.5 text-right font-medium">Cote</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.observedAt} className="border-t border-line">
                <td className="py-1.5">{fmtT(p.observedAt)}</td>
                <td className="py-1.5 text-right font-medium">{fmtOdds(p.odds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
