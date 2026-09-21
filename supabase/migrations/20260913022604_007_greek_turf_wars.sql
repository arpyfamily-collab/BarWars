/*
# Greek Life Turf Wars — Territorial Conquest System

## Overview
Adds a complete Greek life turf war system where fraternities and sororities claim bars
as home turf, defend against sneak attacks and war declarations, and maintain occupancy
to hold their territory.

## New Tables
1. greek_orgs — Greek organizations, each can hold one home turf bar
2. org_memberships — User-to-org links with verification (anti-fraud layer)
3. turf_claims — Anchor record for every turf action (claim, sneak attack, war)
4. turf_checkins — Individual verified check-ins during a claim window
5. turf_maintenance_nights — Weekly maintenance schedule for held turf
6. turf_specials — Bar-offered specials that activate with holding org check-ins
7. turf_events — Public game calendar of all turf war activity

## Views
- turf_leaderboard — Orgs ranked by turf wins and current streak
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

create type org_type as enum ('fraternity', 'sorority');
create type claim_type as enum ('initial_claim', 'sneak_attack', 'war_declaration');
create type claim_status as enum (
  'pending', 'operator_pending', 'live', 'successful', 'failed', 'contested', 'cancelled'
);
create type turf_event_type as enum (
  'claim_announced', 'sneak_attack_detected', 'war_declared', 'rally_called',
  'turf_lost', 'turf_defended', 'maintenance_missed', 'maintenance_warning'
);
create type maintenance_status as enum ('pending', 'met', 'missed', 'warning');
create type org_member_role as enum ('member', 'admin');
create type checkin_method as enum ('qr_scan', 'geo_pulse');
create type turf_visibility as enum ('public', 'orgs_only');

-- ─── GREEK ORGS ───────────────────────────────────────────────────────────────

create table if not exists greek_orgs (
  id                       uuid primary key default gen_random_uuid(),
  org_type                 org_type not null,
  name                     text not null,
  chapter                  text not null default 'Main',
  verified_member_count    int not null default 0,
  home_turf_bar_id         uuid references venues(id) on delete set null,
  turf_claimed_at          timestamptz,
  turf_streak_weeks        int not null default 0,
  turf_wins                int not null default 0,
  turf_losses              int not null default 0,
  created_at               timestamptz not null default now(),
  unique (name, chapter)
);

-- ─── ORG MEMBERSHIPS ──────────────────────────────────────────────────────────

create table if not exists org_memberships (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references greek_orgs(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  role                     org_member_role not null default 'member',
  verified                 boolean not null default false,
  verified_by              uuid references auth.users(id),
  verified_at              timestamptz,
  created_at               timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ─── TURF CLAIMS ──────────────────────────────────────────────────────────────

create table if not exists turf_claims (
  id                           uuid primary key default gen_random_uuid(),
  claim_type                   claim_type not null,
  attacking_org_id             uuid not null references greek_orgs(id) on delete cascade,
  defending_org_id             uuid references greek_orgs(id) on delete set null,
  bar_id                       uuid not null references venues(id) on delete cascade,
  status                       claim_status not null default 'pending',
  announced_at                 timestamptz not null default now(),
  window_open_at               timestamptz not null,
  window_close_at              timestamptz not null,
  required_headcount           int not null,
  attacker_verified_headcount  int not null default 0,
  defender_verified_headcount  int not null default 0,
  detection_threshold          int not null default 50,
  detected_at                  timestamptz,
  rally_window_minutes         int not null default 45,
  lockout_days                 int not null default 14,
  approved_by                  uuid references auth.users(id),
  approved_at                  timestamptz,
  cancel_reason                text,
  result                       text,
  created_at                   timestamptz not null default now(),
  constraint turf_window_valid   check (window_close_at > window_open_at),
  constraint turf_window_min_2h  check (window_close_at - window_open_at >= interval '2 hours'),
  constraint turf_window_max_4h  check (window_close_at - window_open_at <= interval '4 hours'),
  constraint turf_required_positive check (required_headcount > 0),
  constraint turf_detection_range   check (detection_threshold > 0 and detection_threshold <= 100)
);

-- ─── TURF CHECKINS ────────────────────────────────────────────────────────────

create table if not exists turf_checkins (
  id             uuid primary key default gen_random_uuid(),
  claim_id       uuid not null references turf_claims(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  org_id         uuid not null references greek_orgs(id) on delete cascade,
  bar_id         uuid not null references venues(id) on delete cascade,
  verified_at    timestamptz not null default now(),
  method         checkin_method not null default 'qr_scan',
  unique (claim_id, user_id)
);

-- ─── TURF MAINTENANCE NIGHTS ──────────────────────────────────────────────────

create table if not exists turf_maintenance_nights (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references greek_orgs(id) on delete cascade,
  bar_id                   uuid not null references venues(id) on delete cascade,
  day_of_week              int not null check (day_of_week >= 0 and day_of_week <= 6),
  window_start_time        time not null default '21:00',
  window_end_time          time not null default '23:59',
  required_headcount_pct   int not null default 15,
  status                   maintenance_status not null default 'pending',
  last_checked_at          timestamptz,
  consecutive_misses       int not null default 0,
  created_at               timestamptz not null default now(),
  unique (org_id, bar_id, day_of_week)
);

-- ─── TURF SPECIALS ────────────────────────────────────────────────────────────

create table if not exists turf_specials (
  id                  uuid primary key default gen_random_uuid(),
  bar_id              uuid not null references venues(id) on delete cascade,
  org_id              uuid not null references greek_orgs(id) on delete cascade,
  description         text not null,
  discount_cents      int not null default 0,
  active              boolean not null default true,
  valid_day_of_week   int check (valid_day_of_week is null or (valid_day_of_week >= 0 and valid_day_of_week <= 6)),
  created_at          timestamptz not null default now()
);

-- ─── TURF EVENTS ──────────────────────────────────────────────────────────────

create table if not exists turf_events (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid references turf_claims(id) on delete set null,
  event_type      turf_event_type not null,
  org_id          uuid references greek_orgs(id) on delete set null,
  bar_id          uuid not null references venues(id) on delete cascade,
  headline        text not null,
  body            text,
  deep_link       text,
  visible_to      turf_visibility not null default 'public',
  created_at      timestamptz not null default now()
);

-- ─── VIEWS ────────────────────────────────────────────────────────────────────

create or replace view turf_leaderboard as
  select
    o.id, o.org_type, o.name, o.chapter,
    o.verified_member_count,
    o.home_turf_bar_id, v.name as home_turf_bar_name,
    o.turf_claimed_at, o.turf_streak_weeks,
    o.turf_wins, o.turf_losses,
    case when o.turf_wins + o.turf_losses > 0
      then round(o.turf_wins::numeric / (o.turf_wins + o.turf_losses) * 100, 1)
      else null end as win_rate
  from greek_orgs o
  left join venues v on v.id = o.home_turf_bar_id
  order by o.turf_wins desc, o.turf_streak_weeks desc;

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

create index if not exists turf_claims_status_idx       on turf_claims(status);
create index if not exists turf_claims_bar_idx          on turf_claims(bar_id);
create index if not exists turf_claims_attacker_idx     on turf_claims(attacking_org_id);
create index if not exists turf_claims_defender_idx     on turf_claims(defending_org_id);
create index if not exists turf_claims_window_idx       on turf_claims(window_open_at, window_close_at);
create index if not exists turf_checkins_claim_idx      on turf_checkins(claim_id);
create index if not exists turf_checkins_bar_idx        on turf_checkins(bar_id);
create index if not exists turf_checkins_org_idx        on turf_checkins(org_id);
create index if not exists org_memberships_org_idx      on org_memberships(org_id);
create index if not exists org_memberships_user_idx     on org_memberships(user_id);
create index if not exists turf_maint_org_bar_idx       on turf_maintenance_nights(org_id, bar_id);
create index if not exists turf_events_bar_idx          on turf_events(bar_id, created_at desc);
create index if not exists turf_events_type_idx         on turf_events(event_type, created_at desc);
create index if not exists turf_specials_bar_idx        on turf_specials(bar_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table greek_orgs             enable row level security;
alter table org_memberships        enable row level security;
alter table turf_claims            enable row level security;
alter table turf_checkins          enable row level security;
alter table turf_maintenance_nights enable row level security;
alter table turf_specials          enable row level security;
alter table turf_events            enable row level security;

-- greek_orgs: public read
drop policy if exists "public read greek_orgs" on greek_orgs;
create policy "public read greek_orgs" on greek_orgs for select
  to anon, authenticated using (true);

drop policy if exists "org_admin update greek_orgs" on greek_orgs;
create policy "org_admin update greek_orgs" on greek_orgs for update
  to authenticated
  using (exists (select 1 from org_memberships m
    where m.org_id = greek_orgs.id and m.user_id = auth.uid()
      and m.role = 'admin' and m.verified = true))
  with check (exists (select 1 from org_memberships m
    where m.org_id = greek_orgs.id and m.user_id = auth.uid()
      and m.role = 'admin' and m.verified = true));

drop policy if exists "auth insert greek_orgs" on greek_orgs;
create policy "auth insert greek_orgs" on greek_orgs for insert
  to authenticated with check (true);

-- org_memberships
drop policy if exists "own membership read" on org_memberships;
create policy "own membership read" on org_memberships for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "org_admin read members" on org_memberships;
create policy "org_admin read members" on org_memberships for select
  to authenticated
  using (exists (select 1 from org_memberships m2
    where m2.org_id = org_memberships.org_id and m2.user_id = auth.uid()
      and m2.role = 'admin' and m2.verified = true));

drop policy if exists "self insert membership" on org_memberships;
create policy "self insert membership" on org_memberships for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "org_admin update members" on org_memberships;
create policy "org_admin update members" on org_memberships for update
  to authenticated
  using (exists (select 1 from org_memberships m2
    where m2.org_id = org_memberships.org_id and m2.user_id = auth.uid()
      and m2.role = 'admin' and m2.verified = true))
  with check (exists (select 1 from org_memberships m2
    where m2.org_id = org_memberships.org_id and m2.user_id = auth.uid()
      and m2.role = 'admin' and m2.verified = true));

-- turf_claims
drop policy if exists "public read turf_claims" on turf_claims;
create policy "public read turf_claims" on turf_claims for select
  to anon, authenticated
  using (status in ('pending', 'operator_pending', 'live', 'successful', 'failed', 'contested'));

drop policy if exists "auth insert turf_claims" on turf_claims;
create policy "auth insert turf_claims" on turf_claims for insert
  to authenticated with check (true);

drop policy if exists "operator update turf_claims" on turf_claims;
create policy "operator update turf_claims" on turf_claims for update
  to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true));

-- turf_checkins
drop policy if exists "public read turf_checkins" on turf_checkins;
create policy "public read turf_checkins" on turf_checkins for select
  to anon, authenticated using (true);

drop policy if exists "own insert turf_checkins" on turf_checkins;
create policy "own insert turf_checkins" on turf_checkins for insert
  to authenticated with check (auth.uid() = user_id);

-- turf_maintenance_nights
drop policy if exists "org_member read maintenance" on turf_maintenance_nights;
create policy "org_member read maintenance" on turf_maintenance_nights for select
  to authenticated
  using (exists (select 1 from org_memberships m
    where m.org_id = turf_maintenance_nights.org_id
      and m.user_id = auth.uid() and m.verified = true));

drop policy if exists "org_admin insert maintenance" on turf_maintenance_nights;
create policy "org_admin insert maintenance" on turf_maintenance_nights for insert
  to authenticated
  with check (exists (select 1 from org_memberships m
    where m.org_id = turf_maintenance_nights.org_id
      and m.user_id = auth.uid() and m.role = 'admin' and m.verified = true));

drop policy if exists "org_admin update maintenance" on turf_maintenance_nights;
create policy "org_admin update maintenance" on turf_maintenance_nights for update
  to authenticated
  using (exists (select 1 from org_memberships m
    where m.org_id = turf_maintenance_nights.org_id
      and m.user_id = auth.uid() and m.role = 'admin' and m.verified = true))
  with check (exists (select 1 from org_memberships m
    where m.org_id = turf_maintenance_nights.org_id
      and m.user_id = auth.uid() and m.role = 'admin' and m.verified = true));

-- turf_specials (bar_admins uses bar_id not venue_id)
drop policy if exists "public read turf_specials" on turf_specials;
create policy "public read turf_specials" on turf_specials for select
  to anon, authenticated using (true);

drop policy if exists "bar_admin insert turf_specials" on turf_specials;
create policy "bar_admin insert turf_specials" on turf_specials for insert
  to authenticated
  with check (exists (select 1 from bar_admins ba
      where ba.bar_id = turf_specials.bar_id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true));

drop policy if exists "bar_admin update turf_specials" on turf_specials;
create policy "bar_admin update turf_specials" on turf_specials for update
  to authenticated
  using (exists (select 1 from bar_admins ba
      where ba.bar_id = turf_specials.bar_id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true))
  with check (exists (select 1 from bar_admins ba
      where ba.bar_id = turf_specials.bar_id and ba.user_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_staff = true));

-- turf_events
drop policy if exists "public read turf_events" on turf_events;
create policy "public read turf_events" on turf_events for select
  to anon, authenticated using (true);

drop policy if exists "auth insert turf_events" on turf_events;
create policy "auth insert turf_events" on turf_events for insert
  to authenticated with check (true);