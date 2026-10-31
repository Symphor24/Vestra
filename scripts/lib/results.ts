import type { Db } from "./db.ts";
import type { FdMatch, FetchFdMatches } from "./football-data.ts";

// Words that differ between providers without identifying a club ("Arsenal" vs "Arsenal FC").
const NOISE = new Set(["fc", "afc", "cf", "ac", "as", "ssc", "sc", "sv", "vfb", "vfl", "tsg", "rc", "ogc", "club", "calcio", "de", "fk", "and", "hotspur"]);

export function teamTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w));
}

/** True when every meaningful word of the shorter name appears in the longer one. */
export function sameTeam(a: string, b: string): boolean {
  const [x, y] = [teamTokens(a), teamTokens(b)].sort((p, q) => p.length - q.length);
  return x.length > 0 && x.every((w) => y.includes(w));
}

interface Side {
  id: string;
  name: string;
  external_id: string | null;
}
export interface Pending {
  id: string;
  kickoff: Date;
  code: string;
  home: Side;
  away: Side;
}

const MATCH_WINDOW_MS = 36 * 3_600_000;
const day = (d: Date) => d.toISOString().slice(0, 10);

function sideMatches(ours: Side, theirs: FdMatch["homeTeam"]) {
  if (ours.external_id) return ours.external_id === String(theirs.id);
  return [theirs.name, theirs.shortName].some((n) => n && sameTeam(ours.name, n));
}

/**
 * Finds the provider fixture for one of our matches, never guessing:
 * 1. same kickoff (±15 min) and one side recognised: official times match across providers,
 *    and same-city clubs ("Inter Milan" also contains "Milan") rarely share a TV slot;
 * 2. else both sides recognised within 36 h;
 * 3. else a single one-side candidate within 36 h (postponements).
 * Any remaining ambiguity returns null and is reported.
 */
export function findFixture(p: Pending, fd: FdMatch[]): FdMatch | null {
  const gap = (f: FdMatch) => Math.abs(Date.parse(f.utcDate) - p.kickoff.getTime());
  const home = (f: FdMatch) => sideMatches(p.home, f.homeTeam);
  const away = (f: FdMatch) => sideMatches(p.away, f.awayTeam);
  const near = fd.filter((f) => gap(f) <= MATCH_WINDOW_MS && (home(f) || away(f)));
  for (const pick of [near.filter((f) => gap(f) <= 15 * 60_000), near.filter((f) => home(f) && away(f)), near]) {
    if (pick.length === 1) return pick[0];
  }
  return null;
}

export interface ResultsOutcome {
  finished: number;
  postponedOrCancelled: number;
  linked: number;
  unmatched: string[];
  errors: string[];
}

/**
 * Settles matches that kicked off 2 h to 7 days ago and are still "scheduled", and links the ones
 * kicking off within 48 h to their football-data id (so the UI can show live status). One fetch per league covers both.
 */
export async function ingestResults(db: Db, fetchMatches: FetchFdMatches, now: Date): Promise<ResultsOutcome> {
  const rows = (
    await db.query<Record<string, string | Date | null>>(
      `select m.id::text as id, m.kickoff_at, c.football_data_code as code,
         h.id::text as h_id, h.name as h_name, h.external_id as h_ext,
         a.id::text as a_id, a.name as a_name, a.external_id as a_ext
       from public.matches m
       join public.competitions c on c.id = m.competition_id
       join public.teams h on h.id = m.home_team_id
       join public.teams a on a.id = m.away_team_id
       where m.status = 'scheduled' and c.football_data_code is not null
         and (m.kickoff_at between $1::timestamptz - interval '7 days' and $1::timestamptz - interval '2 hours'
           or (m.football_data_id is null and m.kickoff_at between $1::timestamptz and $1::timestamptz + interval '48 hours'))`,
      [now.toISOString()],
    )
  ).rows;
  const pending: Pending[] = rows.map((r) => ({
    id: String(r.id),
    kickoff: new Date(r.kickoff_at as string),
    code: String(r.code),
    home: { id: String(r.h_id), name: String(r.h_name), external_id: r.h_ext as string | null },
    away: { id: String(r.a_id), name: String(r.a_name), external_id: r.a_ext as string | null },
  }));

  const out: ResultsOutcome = { finished: 0, postponedOrCancelled: 0, linked: 0, unmatched: [], errors: [] };
  for (const code of new Set(pending.map((p) => p.code))) {
    const group = pending.filter((p) => p.code === code);
    const times = group.map((p) => p.kickoff.getTime());
    let fd: FdMatch[];
    try {
      fd = await fetchMatches(code, day(new Date(Math.min(...times) - 86_400_000)), day(new Date(Math.max(...times) + 86_400_000)));
    } catch (e) {
      out.errors.push(`${code} : ${(e as Error).message}`);
      continue;
    }
    for (const p of group) {
      const f = findFixture(p, fd);
      const upcoming = p.kickoff >= now;
      if (!f) {
        if (!upcoming) out.unmatched.push(`${p.home.name} – ${p.away.name}`);
        continue;
      }
      try {
        if (upcoming) await link(db, p, f, out);
        else await settle(db, p, f, out);
      } catch (e) {
        out.errors.push(`${p.home.name} – ${p.away.name} : ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/** Learns team ids and records the fixture id, leaving the status alone. */
async function link(db: Db, p: Pending, f: FdMatch, out: ResultsOutcome) {
  await learnTeams(db, p, f);
  await db.query("update public.matches set football_data_id = $2 where id = $1", [p.id, String(f.id)]);
  out.linked++;
}

async function learnTeams(db: Db, p: Pending, f: FdMatch) {
  // Learn provider ids (and a shorter display name) so the next matches are matched exactly.
  for (const [ours, theirs] of [[p.home, f.homeTeam], [p.away, f.awayTeam]] as const) {
    if (theirs.crest) await db.query("update public.teams set crest_url = $2 where id = $1 and crest_url is distinct from $2", [ours.id, theirs.crest]);
    if (ours.external_id || theirs.id === null) continue;
    await db.query(
      `update public.teams set external_id = $2,
         short_name = case when short_name = name then coalesce($3, short_name) else short_name end
       where id = $1 and not exists (select 1 from public.teams where external_id = $2)`,
      [ours.id, String(theirs.id), theirs.shortName],
    );
  }
}

/** Learns team ids, then records the result or the postponement. */
async function settle(db: Db, p: Pending, f: FdMatch, out: ResultsOutcome) {
  await learnTeams(db, p, f);
  const ft = f.score.fullTime;
  if ((f.status === "FINISHED" || f.status === "AWARDED") && ft.home !== null && ft.away !== null) {
    await db.query(
      "update public.matches set status = 'finished', home_score = $2, away_score = $3, football_data_id = $4 where id = $1",
      [p.id, ft.home, ft.away, String(f.id)],
    );
    out.finished++;
  } else if (f.status === "POSTPONED" || f.status === "CANCELLED") {
    await db.query("update public.matches set status = $2, football_data_id = $3 where id = $1", [
      p.id, f.status.toLowerCase(), String(f.id),
    ]);
    out.postponedOrCancelled++;
  }
  // Other statuses (IN_PLAY, PAUSED, TIMED…): try again next run.
}
