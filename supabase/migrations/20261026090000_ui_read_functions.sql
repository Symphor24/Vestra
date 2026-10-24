-- Phase 6: read functions for the web app, called with the anon key through PostgREST (/rest/v1/rpc/...).
-- SECURITY INVOKER: they run with the caller's rights, so RLS still applies.
-- One call returns exactly what a screen needs, instead of thousands of raw snapshot rows.

create function public.ui_matches(p_now timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select m.*, c.name as c_name, c.country as c_country,
           h.name as h_name, h.short_name as h_short, a.name as a_name, a.short_name as a_short
    from public.matches m
    join public.competitions c on c.id = m.competition_id
    join public.teams h on h.id = m.home_team_id
    join public.teams a on a.id = m.away_team_id
    where m.reference_bookmaker is not null
      -- No live source: a match disappears between kickoff and its result rather than being shown wrongly.
      and ((m.status = 'scheduled' and m.kickoff_at > p_now)
        or (m.status = 'finished' and m.kickoff_at > p_now - interval '3 days'))
  ),
  hist as (
    select s.match_id, s.selection_key,
           jsonb_agg(jsonb_build_object('observedAt', s.observed_at, 'odds', s.odds_value) order by s.observed_at) as pts
    from public.odds_snapshots s
    join m on m.id = s.match_id and s.bookmaker = m.reference_bookmaker
    where s.market_key = 'h2h'
    group by 1, 2
  ),
  latest as (
    select distinct on (s.match_id, s.bookmaker, s.selection_key) s.match_id, s.selection_key, s.odds_value
    from public.odds_snapshots s
    join m on m.id = s.match_id
    where s.market_key = 'h2h'
    order by s.match_id, s.bookmaker, s.selection_key, s.observed_at desc
  ),
  cons as (
    select match_id, jsonb_object_agg(selection_key, med) as c, max(n) as books
    from (
      select match_id, selection_key, percentile_cont(0.5) within group (order by odds_value) as med, count(*) as n
      from latest group by 1, 2
    ) x
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id::text,
    'competition', jsonb_build_object('id', m.competition_id::text, 'name', m.c_name, 'country', m.c_country),
    'home', jsonb_build_object('id', m.home_team_id::text, 'name', m.h_name, 'shortName', m.h_short),
    'away', jsonb_build_object('id', m.away_team_id::text, 'name', m.a_name, 'shortName', m.a_short),
    'kickoffAt', m.kickoff_at,
    'status', m.status,
    'homeScore', m.home_score,
    'awayScore', m.away_score,
    'lastSyncedAt', coalesce(m.last_synced_at, m.updated_at),
    'bookmaker', m.reference_bookmaker,
    'confirmedAt', m.reference_seen_at,
    'consensus', coalesce(cons.c, '{}'::jsonb),
    'h2h', jsonb_build_object(
      'home', coalesce((select pts from hist where hist.match_id = m.id and selection_key = 'home'), '[]'::jsonb),
      'draw', coalesce((select pts from hist where hist.match_id = m.id and selection_key = 'draw'), '[]'::jsonb),
      'away', coalesce((select pts from hist where hist.match_id = m.id and selection_key = 'away'), '[]'::jsonb))
  ) order by m.kickoff_at, m.id), '[]'::jsonb)
  from m left join cons on cons.match_id = m.id;
$$;

create function public.ui_tickets(p_now timestamptz default now())
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
    'generatedAt', t.generated_at,
    'methodologyVersion', t.methodology_version,
    'legs', (
      select jsonb_agg(jsonb_build_object(
        'matchId', s.match_id::text, 'outcome', s.selection_key, 'odds', s.odds_at_generation,
        'observedAt', s.observed_at, 'rationale', coalesce(s.rationale, ''),
        'home', jsonb_build_object('name', h.name, 'shortName', h.short_name),
        'away', jsonb_build_object('name', a.name, 'shortName', a.short_name)
      ) order by s.position)
      from public.ticket_selections s
      join public.matches m on m.id = s.match_id
      join public.teams h on h.id = m.home_team_id
      join public.teams a on a.id = m.away_team_id
      where s.ticket_id = t.id)
  ) order by t.category, t.generated_at desc), '[]'::jsonb)
  from public.tickets t
  where t.status = 'active' and (t.expires_at is null or t.expires_at > p_now);
$$;

grant execute on function public.ui_matches(timestamptz), public.ui_tickets(timestamptz) to anon, authenticated;
