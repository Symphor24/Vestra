import type { LiveMatch } from "@/lib/live";
import { Time } from "@/components/ui/time";

const OFF: Record<string, string> = { POSTPONED: "Reporté", SUSPENDED: "Suspendu", CANCELLED: "Annulé" };
export const isLive = (m: LiveMatch) => m.state === "live" || m.state === "paused";

export function StateLabel({ match: m }: { match: LiveMatch }) {
  if (isLive(m))
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
        <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        {m.state === "paused" ? "Mi-temps" : "En direct"}
      </span>
    );
  if (m.state === "finished") return <span className="font-medium text-muted">Terminé</span>;
  if (m.state === "off") return <span className="font-medium text-warn">{OFF[m.status] ?? m.status}</span>;
  return <Time iso={m.kickoffAt} mode="time" className="font-semibold tabular-nums" />;
}
