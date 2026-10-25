-- Multi-market accumulators: one ticket per odds tier and match day, with per-leg and per-ticket results.
-- `tickets` is empty in production, so no data migration.

alter table public.matches
  add column api_football_id bigint unique,
  add column markets_bookmaker text;

-- Tiers become odds targets ('5', '10', ...) instead of the three risk labels.
alter table public.tickets drop constraint tickets_category_check;
alter table public.tickets
  add column match_day date,
  add column featured boolean not null default false,
  add column result text check (result in ('won', 'lost', 'void')),
  add column settled_at timestamptz;

create unique index tickets_day_tier_uniq on public.tickets (match_day, category) where match_day is not null;

alter table public.ticket_selections
  add column result text check (result in ('won', 'lost', 'void'));

alter table public.sync_runs drop constraint sync_runs_job_check;
alter table public.sync_runs add constraint sync_runs_job_check
  check (job in ('ingest-odds', 'ingest-markets', 'ingest-results', 'analyze', 'generate-combos', 'prune'));

-- The numeric sort tolerates legacy labels until the old generator is replaced.
-- 30-day history instead of active tickets only; the UI derives live state from matchStatus.
create or replace function public.ui_tickets(p_now timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id::text,
    'category', t.category,
    'totalOdds', t.total_odds,
    'probability', t.estimated_probability,
    'featured', t.featured,
    'status', t.status,
    'result', t.result,
    'matchDay', t.match_day,
    'generatedAt', t.generated_at,
    'methodologyVersion', t.methodology_version,
    'legs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'matchId', s.match_id::text, 'market', s.market_key, 'outcome', s.selection_key, 'odds', s.odds_at_generation,
        'observedAt', s.observed_at, 'rationale', coalesce(s.rationale, ''), 'result', s.result,
        'kickoffAt', m.kickoff_at, 'footballDataId', m.football_data_id, 'matchStatus', m.status,
        'homeScore', m.home_score, 'awayScore', m.away_score,
        'home', jsonb_build_object('name', h.name, 'shortName', h.short_name),
        'away', jsonb_build_object('name', a.name, 'shortName', a.short_name)
      ) order by s.position)
      from public.ticket_selections s
      join public.matches m on m.id = s.match_id
      join public.teams h on h.id = m.home_team_id
      join public.teams a on a.id = m.away_team_id
      where s.ticket_id = t.id), '[]'::jsonb)
  ) order by t.match_day desc nulls last, case when t.category ~ '^[0-9.]+$' then t.category::numeric end, t.category, t.generated_at desc), '[]'::jsonb)
  from public.tickets t
  where t.generated_at >= p_now - interval '30 days';
$$;
