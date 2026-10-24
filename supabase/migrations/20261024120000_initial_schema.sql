-- Vestra initial schema.
-- Writes go through the service role (ingestion scripts, which bypass RLS); browsers only read,
-- except for their own favourites.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.competitions (
  id bigint generated always as identity primary key,
  external_id text not null unique,            -- The Odds API sport key, e.g. soccer_epl
  football_data_code text unique,              -- football-data.org competition code, e.g. PL
  name text not null,
  country text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.teams (
  id bigint generated always as identity primary key,
  external_id text unique,                     -- football-data.org team id
  odds_api_name text unique,                   -- team name exactly as The Odds API sends it
  name text not null,
  short_name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.matches (
  id bigint generated always as identity primary key,
  external_id text not null unique,            -- The Odds API event id
  football_data_id text unique,
  competition_id bigint not null references public.competitions (id),
  home_team_id bigint not null references public.teams (id),
  away_team_id bigint not null references public.teams (id),
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  -- Movements shown to users are always measured on this single bookmaker, so they stay comparable.
  reference_bookmaker text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_competition_kickoff_idx on public.matches (competition_id, kickoff_at);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);

-- ---------------------------------------------------------------------------
-- Observations: one row per price change, never updated in place
-- ---------------------------------------------------------------------------

create table public.odds_snapshots (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  bookmaker text not null,
  market_key text not null,                    -- e.g. h2h
  selection_key text not null,                 -- e.g. home | draw | away
  odds_value numeric(8, 3) not null check (odds_value > 1),
  observed_at timestamptz not null,            -- bookmaker last_update reported by the provider
  source text not null default 'the-odds-api',
  created_at timestamptz not null default now(),
  -- Makes ingestion idempotent (re-running a sync inserts nothing new) and serves history reads.
  unique (match_id, bookmaker, market_key, selection_key, observed_at)
);

-- ---------------------------------------------------------------------------
-- Derived data
-- ---------------------------------------------------------------------------

create table public.matches_analysis (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  bookmaker text not null,
  market_key text not null,
  selection_key text not null,
  -- True market opening price. Stays null: the free provider tier has no history.
  opening_odds numeric(8, 3) check (opening_odds > 1),
  first_observed_odds numeric(8, 3) check (first_observed_odds > 1),
  current_odds numeric(8, 3) check (current_odds > 1),
  observation_count integer not null default 0 check (observation_count >= 0),
  odds_change_percent numeric(7, 2),
  implied_probability numeric(6, 5) check (implied_probability between 0 and 1),
  normalized_probability numeric(6, 5) check (normalized_probability between 0 and 1),
  -- Null until a model is defined and validated.
  model_probability numeric(6, 5) check (model_probability between 0 and 1),
  confidence_score numeric(5, 2),
  rationale text,
  data_quality_status text not null
    check (data_quality_status in ('ok', 'insufficient_history', 'stale', 'invalid')),
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (match_id, bookmaker, market_key, selection_key)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('moderate', 'intermediate', 'high')),
  total_odds numeric(12, 3) not null check (total_odds > 1),
  estimated_probability numeric(7, 6) check (estimated_probability between 0 and 1),
  status text not null default 'active'
    check (status in ('active', 'expired', 'invalidated', 'settled')),
  generated_at timestamptz not null,
  expires_at timestamptz,
  methodology_version text not null,
  created_at timestamptz not null default now()
);

create index tickets_status_generated_idx on public.tickets (status, generated_at desc);

create table public.ticket_selections (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  match_id bigint not null references public.matches (id) on delete cascade,
  market_key text not null,
  selection_key text not null,
  odds_at_generation numeric(8, 3) not null check (odds_at_generation > 1),
  observed_at timestamptz not null,
  rationale text,
  position smallint not null check (position >= 1),
  created_at timestamptz not null default now(),
  unique (ticket_id, position),
  -- Two outcomes of the same match are mutually exclusive: never in the same ticket.
  unique (ticket_id, match_id)
);

create index ticket_selections_match_idx on public.ticket_selections (match_id);

-- ---------------------------------------------------------------------------
-- Users (only used once Supabase Auth is turned on)
-- ---------------------------------------------------------------------------

create table public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'match', 'ticket')),
  entity_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- Operations: one row per scheduled job run (errors, provider credits used)
-- ---------------------------------------------------------------------------

create table public.sync_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('ingest-odds', 'ingest-results', 'analyze', 'generate-combos', 'prune')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  credits_used integer not null default 0 check (credits_used >= 0),
  credits_remaining integer,
  items_written integer not null default 0,
  error text
);

create index sync_runs_job_started_idx on public.sync_runs (job, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Retention: after a match is old enough, keep only the first and last price of
-- each selection (what the UI and performance history need) and drop the middle.
-- ---------------------------------------------------------------------------

create function public.prune_old_data(keep_days integer default 30) returns bigint
language sql
set search_path = ''
as $$
  delete from public.sync_runs where started_at < now() - interval '90 days';

  with pruned as (
    delete from public.odds_snapshots s
    using public.matches m
    where m.id = s.match_id
      and m.kickoff_at < now() - make_interval(days => keep_days)
      and exists (
        select 1 from public.odds_snapshots e
        where e.match_id = s.match_id and e.bookmaker = s.bookmaker
          and e.market_key = s.market_key and e.selection_key = s.selection_key
          and e.observed_at < s.observed_at)
      and exists (
        select 1 from public.odds_snapshots e
        where e.match_id = s.match_id and e.bookmaker = s.bookmaker
          and e.market_key = s.market_key and e.selection_key = s.selection_key
          and e.observed_at > s.observed_at)
    returning 1
  )
  select count(*) from pruned;
$$;

-- Functions are executable by PUBLIC by default; this one is for the service role only.
revoke execute on function public.prune_old_data(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.matches_analysis enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_selections enable row level security;
alter table public.user_favorites enable row level security;
alter table public.sync_runs enable row level security;

-- Defence in depth: Supabase grants everything to the API roles by default.
-- Grant back only what the app needs; RLS then filters rows.
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.competitions, public.teams, public.matches, public.odds_snapshots,
  public.matches_analysis, public.tickets, public.ticket_selections
  to anon, authenticated;
grant select, insert, delete on public.user_favorites to authenticated;

create policy "Enabled competitions are public" on public.competitions
  for select to anon, authenticated using (is_enabled);
create policy "Teams are public" on public.teams
  for select to anon, authenticated using (true);
create policy "Matches are public" on public.matches
  for select to anon, authenticated using (true);
create policy "Odds snapshots are public" on public.odds_snapshots
  for select to anon, authenticated using (true);
create policy "Analyses are public" on public.matches_analysis
  for select to anon, authenticated using (true);
create policy "Tickets are public" on public.tickets
  for select to anon, authenticated using (true);
create policy "Ticket selections are public" on public.ticket_selections
  for select to anon, authenticated using (true);

-- (select auth.uid()) is evaluated once per statement instead of once per row.
create policy "Users read their favourites" on public.user_favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their favourites" on public.user_favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete their favourites" on public.user_favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

-- sync_runs: no policy and no grant, so only the service role can read or write it.
