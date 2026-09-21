/*
# Turf Wars Phase 3.6 — To Arms Mechanic, Credibility Ledger, Event Type

## Overview
Adds the "To Arms" pre-window recruitment push (one per org per shots fired event),
a JSON credibility ledger on greek_orgs, and a dedicated shots_fired event type.

## Modified Tables

### shots_fired — To Arms tracking
- attacker_to_arms_at (timestamptz, nullable)
- defender_to_arms_at (timestamptz, nullable)

### greek_orgs — credibility ledger JSON
- shots_fired_record (jsonb, default '{"fired":0,"followed_through":0,"stood_down":0}')

## Modified Types
- turf_event_type enum: add 'shots_fired' value
*/

-- ─── SHOTS FIRED: To Arms tracking ────────────────────────────────────────────

alter table shots_fired
  add column if not exists attacker_to_arms_at timestamptz,
  add column if not exists defender_to_arms_at timestamptz;

-- ─── GREEK ORGS: Credibility ledger JSON ──────────────────────────────────────

alter table greek_orgs
  add column if not exists shots_fired_record jsonb not null default '{"fired":0,"followed_through":0,"stood_down":0}'::jsonb;

-- ─── TURF EVENT TYPE: add shots_fired ─────────────────────────────────────────

do $$ begin
  alter type turf_event_type add value if not exists 'shots_fired';
exception when duplicate_object then null;
end $$;

-- ─── HALL OF FAME: recreate with credibility ledger ───────────────────────────

drop view if exists hall_of_fame;

create view hall_of_fame as
  select
    id,
    name,
    org_type,
    turf_wins,
    turf_losses,
    turf_streak_weeks as current_streak,
    longest_turf_streak_weeks as longest_streak,
    wars_won,
    wars_lost,
    sneak_attacks_launched,
    sneak_attacks_repelled,
    shots_fired_count,
    shots_followed_through,
    case when shots_fired_count > 0
      then round(shots_followed_through::numeric / shots_fired_count * 100, 1)
      else null end as follow_through_rate,
    (shots_fired_record->>'fired')::int as cred_fired,
    (shots_fired_record->>'followed_through')::int as cred_followed,
    (shots_fired_record->>'stood_down')::int as cred_stood_down,
    (turf_wins * 3 + wars_won * 5 + sneak_attacks_repelled * 2 + longest_turf_streak_weeks * 2) as fame_score
  from greek_orgs
  where turf_wins > 0 or wars_won > 0 or sneak_attacks_repelled > 0 or shots_fired_count > 0
  order by fame_score desc;