-- Phase 5: data needed by the quality filters (cahier des charges §11.4).

-- Providers timestamp a price when it last changed. This records the last sync where the reference
-- bookmaker still offered the market, so an unchanged price is not mistaken for a stale one.
alter table public.matches add column reference_seen_at timestamptz;

-- Median of the latest price across all bookmakers, to spot an off-market reference price.
alter table public.matches_analysis
  add column consensus_odds numeric(8, 3) check (consensus_odds > 1),
  add column bookmaker_count smallint not null default 0 check (bookmaker_count >= 0);

alter table public.matches_analysis drop constraint matches_analysis_data_quality_status_check;
alter table public.matches_analysis add constraint matches_analysis_data_quality_status_check
  check (data_quality_status in ('ok', 'insufficient_history', 'stale', 'invalid', 'divergent'));
