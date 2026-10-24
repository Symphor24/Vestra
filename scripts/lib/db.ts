import postgres from "postgres";

/** The only DB surface scripts use, so tests can pass a PGlite instance instead. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Connects with DATABASE_URL. On Supabase use the "Session pooler" string:
 * the direct host is IPv6-only and GitHub runners have no IPv6.
 */
export function connect(url: string): Db & { close(): Promise<void> } {
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return { rows: (await sql.unsafe(text, params as never[])) as unknown as T[] };
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
