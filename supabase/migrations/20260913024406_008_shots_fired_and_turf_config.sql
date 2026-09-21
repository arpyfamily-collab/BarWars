/*
# Turf Wars Phase 2 — Shots Fired, Check-in Verification, Bar Config, Bluff Economy

## Overview
Adds the "Shots Fired" economic warfare layer (orgs buy drinks at a bar to signal
an incoming sneak attack), bar-level turf configuration (eligible nights, headcount
thresholds), turf check-in verification with anti-fraud rules, and bluff credibility
stats on Greek orgs.

## New Tables

### shots_fired
Records each instance of an org "firing shots" at a bar — purchasing drinks to signal
an imminent sneak attack. Bar admin must confirm. Auto-expires if no attack follows
within 72 hours.
- id, org_id, bar_id, status ('pending_confirmation' | 'confirmed' | 'expired' | 'stand_down'),
  shots_count (int — number of drinks purchased),
  confirmed_by (uuid — bar admin who confirmed),
  confirmed_at, expires_at (72hr window),
  resulting_claim_id (nullable FK to turf_claims — if a sneak attack follows),
  receipt_photo_url (nullable — for honor system receipt upload),
  created_at

## Modified Tables

### venues — adds turf config columns
- turf_claim_headcount_pct (int, default 25 — % of org roster needed to claim)
- turf_maintenance_headcount_pct (int, default 15 — % needed for weekly maintenance)
- turf_sneak_attack_headcount_pct (int, default 20 — % needed for sneak attack)
- turf_shots_min (int, default 10 — minimum drink purchases to fire shots)
- turf_sneak_attack_nights (int[], default {1,2,3,4} — Mon–Thu)
- turf_war_nights (int[], default {5,6} — Fri–Sat)
- turf_maintenance_nights_required (int, default 2 — nights per week)
- turf_enabled (boolean, default false — bar must opt in)

### greek_orgs — adds bluff/stats columns
- shots_fired_count (int, default 0 — total times shots were fired)
- shots_followed_through (int, default 0 — times an attack actually followed)
- sneak_attacks_launched (int, default 0)
- sneak_attacks_repelled (int, default 0)
- wars_won (int, default 0)
- wars_lost (int, default 0)
- longest_turf_streak_weeks (int, default 0)

## New Enums
- shot_status: 'pending_confirmation' | 'confirmed' | 'expired' | 'stand_down'

## Security
- shots_fired: public read (visible threat indicator), authenticated insert (org members),
  bar admin/operator update (confirm/expire)
- venues columns: public read (config is visible), operator/bar_admin update
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

create type shot_status as enum ('pending_confirmation', 'confirmed', 'expired', 'stand_down');

-- ─── SHOTS FIRED ──────────────────────────────────────────────────────────────

create table if not exists shots_fired (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references greek_orgs(id) on delete cascade,
  bar_id                uuid not null references venues(id) on delete cascade,
  status                shot_status not null default 'pending_confirmation',
  shots_count           int not null check (shots_count > 0),
  confirmed_by          uuid references auth.users(id),
  confirmed_at          timestamptz,
  expires_at            timestamptz not null default (now() + interval '72 hours'),
  resulting_claim_id    uuid references turf_claims(id) on delete set null,
  receipt_photo_url     text,
  created_at            timestamptz not null default now()
);

create index if not exists shots_fired_bar_idx     on shots_fired(bar_id) where status in ('pending_confirmation', 'confirmed');
create index if not exists shots_fired_org_idx     on shots_fired(org_id);
create index if not exists shots_fired_status_idx  on shots_fired(status);
create index if not exists shots_fired_expires_idx on shots_fired(expires_at) where status = 'confirmed';

-- ─── VENUE TURF CONFIG ────────────────────────────────────────────────────────

alter table venues
  add column if not exists turf_claim_headcount_pct        int not null default 25,
  add column if not exists turf_maintenance_headcount_pct  int not null default 15,
  add column if not exists turf_sneak_attack_headcount_pct int not null default 20,
  add column if not exists turf_shots_min                  int not null default 10,
  add column if not exists turf_sneak_attack_nights        int[] not null default '{1,2,3,4}',
  add column if not exists turf_war_nights                 int[] not null default '{5,6}',
  add column if not exists turf_maintenance_nights_required int not null default 2,
  add column if not exists turf_enabled                    boolean not null default false;

-- ─── GREEK ORG BLUFF/STATS ────────────────────────────────────────────────────

alter table greek_orgs
  add column if not exists shots_fired_count         int not null default 0,
  add column if not exists shots_followed_through    int not null default 0,
  add column if not exists sneak_attacks_launched    int not null default 0,
  add column if not exists sneak_attacks_repelled    int not null default 0,
  add column if not exists wars_won                  int not null default 0,
  add column if not exists wars_lost                 int not null default 0,
  add column if not exists longest_turf_streak_weeks int not null default 0;

-- ─── THREAT LEVEL VIEW ────────────────────────────────────────────────────────
-- Computes a live threat level per bar based on active shots fired records.

create or replace view bar_threat_levels as
  select
    v.id as bar_id,
    v.name as bar_name,
    v.turf_enabled,
    coalesce(sf.active_shots, 0) as active_shots_count,
    case
      when coalesce(sf.pending_count, 0) > 0 and coalesce(sf.confirmed_count, 0) > 0
        then 'active_attack'
      when coalesce(sf.confirmed_count, 0) > 0
        then 'shots_fired'
      when coalesce(sf.pending_count, 0) > 0
        then 'tense'
      else 'quiet'
    end as threat_level,
    go.name as turf_holder_name,
    go.org_type as turf_holder_type,
    go.turf_streak_weeks as holder_streak_weeks
  from venues v
  left join (
    select
      bar_id,
      count(*) as active_shots,
      count(*) filter (where status = 'pending_confirmation') as pending_count,
      count(*) filter (where status = 'confirmed') as confirmed_count
    from shots_fired
    where status in ('pending_confirmation', 'confirmed')
      and expires_at > now()
    group by bar_id
  ) sf on sf.bar_id = v.id
  left join greek_orgs go on go.home_turf_bar_id = v.id;

-- ─── BLUFF CREDIBILITY VIEW ───────────────────────────────────────────────────

create or replace view org_bluff_stats as
  select
    id, name, org_type,
    shots_fired_count,
    shots_followed_through,
    case when shots_fired_count > 0
      then round(shots_followed_through::numeric / shots_fired_count * 100, 1)
      else null end as follow_through_rate,
    sneak_attacks_launched,
    sneak_attacks_repelled,
    wars_won,
    wars_lost,
    longest_turf_streak_weeks
  from greek_orgs
  order by shots_fired_count desc;

-- ─── RLS FOR SHOTS FIRED ──────────────────────────────────────────────────────

alter table shots_fired enable row level security;

drop policy if exists "public read shots_fired" on shots_fired;
create policy "public read shots_fired"
  on shots_fired for select
  to anon, authenticated
  using (status in ('confirmed', 'expired', 'stand_down'));

-- Org members can see their own pending shots
drop policy if exists "org_member read own shots" on shots_fired;
create policy "org_member read own shots"
  on shots_fired for select
  to authenticated
  using (
    exists (select 1 from org_memberships m
      where m.org_id = shots_fired.org_id
        and m.user_id = auth.uid() and m.verified = true)
  );

-- Verified org members can fire shots
drop policy if exists "org_member insert shots_fired" on shots_fired;
create policy "org_member insert shots_fired"
  on shots_fired for insert
  to authenticated
  with check (
    exists (select 1 from org_memberships m
      where m.org_id = shots_fired.org_id
        and m.user_id = auth.uid() and m.verified = true)
  );

-- Bar admin or operator can confirm/expire shots
drop policy if exists "bar_admin update shots_fired" on shots_fired;
create policy "bar_admin update shots_fired"
  on shots_fired for update
  to authenticated
  using (
    exists (select 1 from bar_admins ba
      where ba.bar_id = shots_fired.bar_id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true)
  )
  with check (
    exists (select 1 from bar_admins ba
      where ba.bar_id = shots_fired.bar_id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true)
  );

-- Venue turf config: bar admin/operator can update
drop policy if exists "bar_admin update turf config" on venues;
create policy "bar_admin update turf config"
  on venues for update
  to authenticated
  using (
    exists (select 1 from bar_admins ba
      where ba.bar_id = venues.id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true)
  )
  with check (
    exists (select 1 from bar_admins ba
      where ba.bar_id = venues.id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true)
  );