import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Minimal stand-in for what Supabase provides, so the real migrations run unchanged.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  -- Supabase's default: API roles get every privilege on new public objects; RLS is the real guard.
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

export const SEED = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec(SEED);
  return db;
}
