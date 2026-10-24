import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, SEED } from "./setup-db";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

/** Runs `sql` as an API role (optionally as a signed-in user), then switches back to the owner. */
async function as<T>(role: "anon" | "authenticated", sql: string, params: unknown[] = [], user = "") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

async function addMatch(externalId: string, kickoffHours: number) {
  const [{ id }] = (
    await db.query<{ id: number }>(
      `insert into public.matches (external_id, competition_id, home_team_id, away_team_id, kickoff_at)
       values ($1, 1, 1, 2, $2) returning id`,
      [externalId, iso(kickoffHours)],
    )
  ).rows;
  return id;
}

const snap = (matchId: number, odds: number, observedHours: number) =>
  db.query(
    `insert into public.odds_snapshots (match_id, bookmaker, market_key, selection_key, odds_value, observed_at)
     values ($1, 'bk', 'h2h', 'home', $2, $3) on conflict do nothing`,
    [matchId, odds, iso(observedHours)],
  );

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id) values ('${A}'), ('${B}');
    insert into public.teams (name, short_name) values ('Arsenal', 'Arsenal'), ('Chelsea', 'Chelsea');
  `);
});

describe("schema constraints", () => {
  it("seeds the five launch competitions idempotently", async () => {
    await db.exec(SEED);
    expect((await db.query("select * from public.competitions")).rows).toHaveLength(5);
  });

  it("rejects a match against itself and odds of 1 or less", async () => {
    await expect(
      db.query(`insert into public.matches (external_id, competition_id, home_team_id, away_team_id, kickoff_at)
                values ('self', 1, 1, 1, now())`),
    ).rejects.toThrow(/check/);
    const id = await addMatch("odds-check", 24);
    await expect(snap(id, 1, 0)).rejects.toThrow(/check/);
  });

  it("keeps ingestion idempotent: the same observation is stored once", async () => {
    const id = await addMatch("dedupe", 24);
    const at = iso(-1);
    const insert = () =>
      db.query(
        `insert into public.odds_snapshots (match_id, bookmaker, market_key, selection_key, odds_value, observed_at)
         values ($1, 'bk', 'h2h', 'home', 2.1, $2) on conflict do nothing`,
        [id, at],
      );
    await insert();
    await insert();
    await snap(id, 2.0, 0); // a new price is a new row
    const rows = (await db.query("select odds_value from public.odds_snapshots where match_id = $1", [id])).rows;
    expect(rows).toHaveLength(2);
  });

  it("refuses two selections of the same match in one ticket", async () => {
    const m = await addMatch("ticket", 24);
    const [{ id }] = (
      await db.query<{ id: string }>(
        `insert into public.tickets (title, category, total_odds, generated_at, methodology_version)
         values ('t', 'moderate', 3, now(), '0.1.0') returning id`,
      )
    ).rows;
    const leg = (pos: number, sel: string) =>
      db.query(
        `insert into public.ticket_selections (ticket_id, match_id, market_key, selection_key, odds_at_generation, observed_at, position)
         values ($1, $2, 'h2h', $3, 2, now(), $4)`,
        [id, m, sel, pos],
      );
    await leg(1, "home");
    await expect(leg(2, "draw")).rejects.toThrow(/unique/);
  });

  it("maintains updated_at", async () => {
    const id = await addMatch("updated", 24);
    await db.exec("select pg_sleep(0.01)");
    const [r] = (
      await db.query<{ changed: boolean }>(
        "update public.matches set status = 'live' where id = $1 returning updated_at > created_at as changed",
        [id],
      )
    ).rows;
    expect(r.changed).toBe(true);
  });
});

describe("access policies", () => {
  it("lets visitors read public data but not write it", async () => {
    expect(await as("anon", "select id from public.competitions")).toHaveLength(5);
    expect((await as("anon", "select id from public.matches")).length).toBeGreaterThan(0);
    await expect(
      as("anon", `insert into public.teams (name, short_name) values ('x', 'x')`),
    ).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", "delete from public.odds_snapshots", [], A)).rejects.toThrow(/permission denied/);
  });

  it("hides disabled competitions", async () => {
    await db.exec("update public.competitions set is_enabled = false where external_id = 'soccer_epl'");
    expect(await as("anon", "select id from public.competitions")).toHaveLength(4);
    await db.exec("update public.competitions set is_enabled = true where external_id = 'soccer_epl'");
  });

  it("keeps operational logs private", async () => {
    await db.exec("insert into public.sync_runs (job) values ('ingest-odds')");
    await expect(as("anon", "select * from public.sync_runs")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", "select * from public.sync_runs", [], A)).rejects.toThrow(/permission denied/);
  });

  it("isolates favourites per user", async () => {
    await as("authenticated", "insert into public.user_favorites (entity_type, entity_id) values ('team', 'arsenal')", [], A);
    expect(await as("authenticated", "select * from public.user_favorites", [], A)).toHaveLength(1);
    expect(await as("authenticated", "select * from public.user_favorites", [], B)).toHaveLength(0);
    await expect(
      as("authenticated", "insert into public.user_favorites (user_id, entity_type, entity_id) values ($1, 'team', 'x')", [A], B),
    ).rejects.toThrow(/row-level security/);
    await as("authenticated", "delete from public.user_favorites", [], B); // B cannot delete A's rows
    expect(await as("authenticated", "select * from public.user_favorites", [], A)).toHaveLength(1);
    await expect(as("anon", "select * from public.user_favorites")).rejects.toThrow(/permission denied/);
  });

  it("does not let API roles run maintenance", async () => {
    await expect(as("anon", "select public.prune_old_data()")).rejects.toThrow(/permission denied/);
  });
});

describe("retention", () => {
  it("keeps only first and last price of old matches, leaves recent ones intact", async () => {
    const old = await addMatch("old", -24 * 40);
    const recent = await addMatch("recent", 24);
    for (const [i, o] of [2.4, 2.3, 2.2, 2.1].entries()) {
      await snap(old, o, -24 * 45 + i);
      await snap(recent, o, -10 + i);
    }
    const [{ prune_old_data }] = (await db.query<{ prune_old_data: number }>("select public.prune_old_data(30)")).rows;
    expect(Number(prune_old_data)).toBe(2);
    const left = (await db.query<{ odds_value: string }>("select odds_value from public.odds_snapshots where match_id = $1 order by observed_at", [old])).rows;
    expect(left.map((r) => Number(r.odds_value))).toEqual([2.4, 2.1]);
    expect((await db.query("select 1 from public.odds_snapshots where match_id = $1", [recent])).rows).toHaveLength(4);
  });
});
