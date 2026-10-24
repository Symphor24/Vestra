import { connect, type Db } from "./db.ts";
import { DbEnv, loadEnv } from "./env.ts";

type Job = "analyze" | "generate-combos";

/** Logs a job in sync_runs (running → ok | error) around `fn`. */
export async function withSyncRun<T>(db: Db, job: Job, fn: () => Promise<{ items: number; result: T }>): Promise<T> {
  const [{ id }] = (await db.query<{ id: number }>("insert into public.sync_runs (job) values ($1) returning id", [job])).rows;
  try {
    const { items, result } = await fn();
    await db.query("update public.sync_runs set finished_at = now(), status = 'ok', items_written = $2 where id = $1", [id, items]);
    return result;
  } catch (e) {
    await db.query("update public.sync_runs set finished_at = now(), status = 'error', error = $2 where id = $1", [id, (e as Error).message]);
    throw e;
  }
}

/** Entry point shared by the DB-only scripts: env check, connection, logging, exit code. */
export async function main<T>(job: Job, fn: (db: Db, now: Date) => Promise<{ items: number; result: T }>) {
  let env;
  try {
    env = loadEnv(DbEnv);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const db = connect(env.DATABASE_URL);
  try {
    console.log(JSON.stringify(await withSyncRun(db, job, () => fn(db, new Date())), null, 2));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
