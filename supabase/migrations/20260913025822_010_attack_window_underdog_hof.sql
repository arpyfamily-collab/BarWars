/*
# Turf Wars Phase 3 — Attack Window, Underdog Bonus, Hall of Fame

## Modified Tables

### shots_fired — add attack window timing
- attack_window_opens_at (timestamptz, nullable — set when bar admin confirms,
  randomized 2-6 hours after confirmation)
- attack_window_closes_at (timestamptz, nullable — 90 minutes after opens_at)

### turf_claims — add underdog bonus tracking
- underdog_bonus (boolean, default false — true when attacker has fewer verified
  members than defender and wins)
- war_points_multiplier (numeric, default 1.0 — 1.5x for underdog wins)

## New Views

### hall_of_fame
Aggregates all-time records across all Greek orgs:
- longest turf hold (in weeks)
- most war declarations won
- most sneak attacks repelled
- most shots fired (with follow-through rate)
Ranked for display on the Hall of Fame page.

### turf_war_records
Per-org war record broken out by type (sneak attack vs war declaration).
*/

-- ─── SHOTS FIRED: Attack Window ───────────────────────────────────────────────

alter table shots_fired
  add column if not exists attack_window_opens_at   timestamptz,
  add column if not exists attack_window_closes_at  timestamptz;

-- ─── TURF CLAIMS: Underdog Bonus ──────────────────────────────────────────────

alter table turf_claims
  add column if not exists underdog_bonus       boolean not null default false,
  add column if not exists war_points_multiplier numeric(3,1) not null default 1.0;

-- ─── HALL OF FAME VIEW ─────────────────────────────────────────────────────────

create or replace view hall_of_fame as
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
    -- Composite score for ranking
    (turf_wins * 3 + wars_won * 5 + sneak_attacks_repelled * 2 + longest_turf_streak_weeks * 2) as fame_score
  from greek_orgs
  where turf_wins > 0 or wars_won > 0 or sneak_attacks_repelled > 0 or shots_fired_count > 0
  order by fame_score desc;

-- ─── TURF WAR RECORDS VIEW ────────────────────────────────────────────────────

create or replace view turf_war_records as
  select
    id,
    name,
    org_type,
    sneak_attacks_launched,
    sneak_attacks_repelled,
    case when sneak_attacks_launched > 0
      then round((sneak_attacks_launched - sneak_attacks_repelled)::numeric / sneak_attacks_launched * 100, 1)
      else null end as sneak_attack_success_rate,
    wars_won,
    wars_lost,
    case when (wars_won + wars_lost) > 0
      then round(wars_won::numeric / (wars_won + wars_lost) * 100, 1)
      else null end as war_win_rate,
    shots_fired_count,
    shots_followed_through
  from greek_orgs
  order by wars_won desc, sneak_attacks_launched desc;

-- ─── RLS: No new policies needed — views inherit from base tables ─────────────