/*
# Turf Wars Phase 3.5 — Surge Fees, Rate Limiting, Compressed Timing

## Overview
Implements the three operational refinements:
1. Compressed attack window (1-3 hours after confirmation, down from 2-6)
2. Surge Event Fee — attacking org pays the bar a flat fee at Shots Fired time
3. Rate limiting — max 3 sneak attacks per org per 30 days, max 1 per bar per 14 days,
   stand-downs count as used attacks, max 1 war declaration per org per 30 days

## Modified Tables

### shots_fired — add surge fee tracking
- surge_fee_cents (int, default 0 — fee paid by attacking org to the bar)
- surge_fee_refunded_cents (int, default 0 — amount refunded on stand-down, 50% default)
- surge_fee_paid (boolean, default false — whether the fee was captured at filing time)

### venues — add surge fee config
- turf_surge_fee_cents (int, default 0 — flat fee the bar charges for a shots fired event.
  0 = no fee required. Configurable by bar admin.)

### greek_orgs — add rate limit tracking
- sneak_attacks_used_30day (int, default 0 — count of sneak attacks/shots fired in last 30 days)
- war_declarations_used_30day (int, default 0 — count of war declarations in last 30 days)
- last_sneak_attack_at (timestamptz, nullable — timestamp of most recent sneak attack)
- last_war_declaration_at (timestamptz, nullable — timestamp of most recent war declaration)

## New Indexes
- shots_fired_org_created_idx: for 30-day rolling count queries on shots_fired by org
- shots_fired_org_bar_idx: for 14-day per-bar cooldown queries

## Notes
- The 4-hour advance notice floor is enforced in application logic, not schema:
  when a bar admin confirms shots, the earliest the window can open is
  confirmed_at + 4 hours. The randomization range is 1-3 hours added on top
  of that floor (so total delay = 4-7 hours from confirmation, but the
  "window opens in 1-3 hours" messaging refers to the random portion after
  the advance notice period).

  CORRECTION: Per the spec, the window opens 1-3 hours after confirmation
  with a 4-hour advance notice requirement meaning the SHOTS must be FILED
  at least 4 hours before the earliest possible window. Since the bar admin
  confirms immediately after the org files, and the window opens 1-3 hours
  after confirmation, the 4-hour floor is enforced at FILING time:
  the org must file shots at least 4 hours before they want the window to
  potentially open. In practice, the window opens 1-3 hours after bar admin
  confirms, and the org must have filed at least 4 hours before that.
  The simplest implementation: bar admin sees the filing, confirms, and
  the window opens 1-3 hours later. The 4-hour notice is the gap between
  filing and confirmation (the bar admin can't confirm until 4 hours have
  passed since filing, giving the bar time to staff up).

  FINAL DECISION: The advance notice is enforced as a minimum gap between
  shots_fired.created_at and the attack window opening. When the bar admin
  confirms, the system sets attack_window_opens_at to max(now + 1hr random,
  created_at + 4 hours + 1hr random). This ensures at least 4 hours of
  notice for the bar from filing time.
*/

-- ─── SHOTS FIRED: Surge Fee ───────────────────────────────────────────────────

alter table shots_fired
  add column if not exists surge_fee_cents          int not null default 0,
  add column if not exists surge_fee_refunded_cents int not null default 0,
  add column if not exists surge_fee_paid           boolean not null default false;

-- ─── VENUES: Surge Fee Config ─────────────────────────────────────────────────

alter table venues
  add column if not exists turf_surge_fee_cents int not null default 0;

-- ─── GREEK ORGS: Rate Limit Tracking ──────────────────────────────────────────

alter table greek_orgs
  add column if not exists sneak_attacks_used_30day     int not null default 0,
  add column if not exists war_declarations_used_30day  int not null default 0,
  add column if not exists last_sneak_attack_at         timestamptz,
  add column if not exists last_war_declaration_at      timestamptz;

-- ─── INDEXES for rate limit queries ───────────────────────────────────────────

create index if not exists shots_fired_org_created_idx
  on shots_fired(org_id, created_at desc)
  where status in ('confirmed', 'expired', 'stand_down');

create index if not exists shots_fired_org_bar_idx
  on shots_fired(org_id, bar_id, created_at desc)
  where status in ('confirmed', 'expired', 'stand_down');

-- ─── HALL OF FAME VIEW: add follow-through and rate limit stats ───────────────

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
    (turf_wins * 3 + wars_won * 5 + sneak_attacks_repelled * 2 + longest_turf_streak_weeks * 2) as fame_score
  from greek_orgs
  where turf_wins > 0 or wars_won > 0 or sneak_attacks_repelled > 0 or shots_fired_count > 0
  order by fame_score desc;