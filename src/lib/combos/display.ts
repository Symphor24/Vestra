import type { LiveMatch, LiveState } from "../live.ts";
import { settleLeg, ticketStatus, type LegResult, type MatchState } from "./settle.ts";
import type { Ticket } from "../types.ts";

const LIVE_STATE: Record<LiveState, MatchState> = { live: "live", paused: "live", finished: "finished", off: "scheduled", scheduled: "scheduled" };
// Only a postponed or cancelled match voids a leg; SUSPENDED or unknown statuses stay pending.
const matchState = (m: LiveMatch): MatchState => (m.state === "off" && (m.status === "POSTPONED" || m.status === "CANCELLED") ? "void" : LIVE_STATE[m.state]);

export interface TicketStatus {
  status: LegResult;
  legStatus: LegResult[];
  live: (LiveMatch | null)[];
}

/** Database result first (it is final); otherwise the status the live scores imply right now. */
export function displayStatus(ticket: Ticket, liveById: Map<string, LiveMatch>): TicketStatus {
  const live = ticket.legs.map((l) => (l.footballDataId ? liveById.get(l.footballDataId) ?? null : null));
  const legStatus = ticket.legs.map((l, i) => {
    if (l.result) return l.result;
    const m = live[i];
    return m ? settleLeg(l.market, l.outcome, m.home.score, m.away.score, matchState(m)) : "pending";
  });
  return { status: ticket.result ?? ticketStatus(legStatus), legStatus, live };
}
