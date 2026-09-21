/*
# Turf Wars Phase 7 — The Spy Network

## Overview
Five distinct spy types with recruitment, intel passing, mole hunts, ghost
conversion, and loyalty tests. The platform itself (The Don) becomes an active
intelligence broker, not just infrastructure.

## Spy Types
1. Infiltrator — Greek org member turned spy, recruited by rival org/Hessian/platform
2. Bar Asset — bar employee who sells visible intelligence
3. Double Agent — Hessian member cultivated by 2+ orgs simultaneously
4. Ghost — magic link lead who submits anonymous observation reports
5. Internal Auditor — loyalty test issued by the platform

## New Tables

### spy_recruitments
Sealed approach notifications sent to users. Sender is ambiguous (rival org,
Hessian captain, or platform).
- id, target_user_id (who is approached)
- recruiter_type: 'rival_org' | 'hessian_captain' | 'platform'
- recruiter_org_id (nullable — hidden from target)
- recruiter_company_id (nullable — hidden from target)
- status: 'pending' | 'accepted' | 'deleted' | 'reported'
- is_platform_test (boolean — true if this is a loyalty test)
- loyalty_flag (nullable — set when test resolved: 'susceptible' | 'high_loyalty')
- created_at, resolved_at

### spy_assets
Active spy relationships. Created when a recruitment is accepted or a
cultivation is established.
- id, asset_user_id (the spy)
- handler_type: 'org' | 'hessian_company' | 'platform'
- handler_org_id (nullable)
- handler_company_id (nullable)
- spy_type: 'infiltrator' | 'bar_asset' | 'double_agent'
- is_active (boolean)
- burned (boolean — publicly revealed)
- burned_at, burned_by_org_id
- created_at

### spy_intel
Intel reports passed from spy to handler. Disappears after 24 hours.
- id, asset_id (references spy_assets)
- claim_id (nullable — the event this intel is about)
- intel_type: 'headcount' | 'shots_fired_plan' | 'war_declaration_plan' | 'bar_observation'
- content (text — the intel itself)
- expires_at (timestamptz — 24 hours after creation)
- created_at

### spy_cultivations
Cultivation requests from orgs/Hessians to bar assets or Hessian members.
- id, cultivator_type: 'org' | 'hessian_company'
- cultivator_org_id (nullable)
- cultivator_company_id (nullable)
- target_user_id (the person being cultivated)
- offer_type: 'loyalty_points' | 'hessian_special' | 'social_acknowledgment'
- offer_detail (text)
- status: 'pending' | 'accepted' | 'declined'
- intel_quality_rating (int 1-5, nullable — rated by cultivator after event)
- created_at, resolved_at

### mole_hunts
False intelligence operations to catch infiltrators.
- id, org_id (the org running the mole hunt)
- fake_bar_id (the bar used as bait)
- fake_event_date (date of the fake event)
- fake_claim_type: 'sneak_attack' | 'war_declaration'
- status: 'active' | 'resolved' | 'mole_found' | 'no_mole'
- suspected_mole_id (uuid, nullable — resolved when mole is identified)
- created_at, resolved_at

### ghost_profiles
Lightweight burner profiles for magic link leads who didn't fully register.
- id, codename (text — their spy identity)
- email (nullable — from the magic link)
- original_invite_token (nullable — the ally invite that brought them)
- upgrade_eligible (boolean — true after 3 quality-rated reports)
- reports_count (int, denormalized)
- created_at

### ghost_reports
Anonymous observation reports from Ghosts.
- id, ghost_id (references ghost_profiles)
- claim_id (nullable — the event observed)
- bar_id (nullable — the bar observed)
- observation (text — what they saw)
- orgs_present (text — comma-separated org names they spotted)
- headcount_estimate (int, nullable)
- quality_rating (int 1-5, nullable — rated by the platform operator)
- created_at

### spy_badges
Permanent credentials displayed on user profiles.
- id, user_id
- badge_type: 'burned' | 'mata_hari' | 'high_loyalty'
- awarded_at
- awarded_by_org_id (nullable — for burned/high_loyalty)
- detail (text — e.g. "Burned: [Date]" or "Exposed as Double Agent")

## Security
- spy_recruitments: user sees only their own; org/platform insert via service role
- spy_assets: user sees their own; handler org/company can read their assets
- spy_intel: asset and handler can read; auto-expires after 24h
- spy_cultivations: target and cultivator can read; respective insert
- mole_hunts: org leadership read; captain insert
- ghost_profiles: self read; public read of codename only
- ghost_reports: platform operator read; ghost self insert
- spy_badges: public read (they're display credentials)
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

do $$ begin
  create type spy_recruiter_type as enum ('rival_org', 'hessian_captain', 'platform');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type spy_recruitment_status as enum ('pending', 'accepted', 'deleted', 'reported');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type spy_type_enum as enum ('infiltrator', 'bar_asset', 'double_agent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type spy_handler_type as enum ('org', 'hessian_company', 'platform');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type spy_intel_type as enum ('headcount', 'shots_fired_plan', 'war_declaration_plan', 'bar_observation');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type cultivation_offer_type as enum ('loyalty_points', 'hessian_special', 'social_acknowledgment');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type cultivation_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type mole_hunt_status as enum ('active', 'resolved', 'mole_found', 'no_mole');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type spy_badge_type as enum ('burned', 'mata_hari', 'high_loyalty');
exception when duplicate_object then null;
end $$;

-- ─── SPY RECRUITMENTS ─────────────────────────────────────────────────────────

create table if not exists spy_recruitments (
  id                    uuid primary key default gen_random_uuid(),
  target_user_id        uuid not null references auth.users(id) on delete cascade,
  recruiter_type        spy_recruiter_type not null,
  recruiter_org_id      uuid references greek_orgs(id) on delete cascade,
  recruiter_company_id  uuid references hessian_companies(id) on delete cascade,
  status                spy_recruitment_status not null default 'pending',
  is_platform_test      boolean not null default false,
  loyalty_flag          text,
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  constraint spy_recruitments_loyalty_check check (
    loyalty_flag is null or loyalty_flag in ('susceptible', 'high_loyalty')
  )
);

create index if not exists spy_recruitments_target_idx on spy_recruitments(target_user_id);
create index if not exists spy_recruitments_status_idx on spy_recruitments(status);
create index if not exists spy_recruitments_pending_idx on spy_recruitments(target_user_id) where status = 'pending';

-- ─── SPY ASSETS ───────────────────────────────────────────────────────────────

create table if not exists spy_assets (
  id                  uuid primary key default gen_random_uuid(),
  asset_user_id       uuid not null references auth.users(id) on delete cascade,
  handler_type        spy_handler_type not null,
  handler_org_id      uuid references greek_orgs(id) on delete cascade,
  handler_company_id  uuid references hessian_companies(id) on delete cascade,
  spy_type            spy_type_enum not null,
  is_active           boolean not null default true,
  burned              boolean not null default false,
  burned_at           timestamptz,
  burned_by_org_id    uuid references greek_orgs(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists spy_assets_user_idx on spy_assets(asset_user_id);
create index if not exists spy_assets_handler_org_idx on spy_assets(handler_org_id);
create index if not exists spy_assets_handler_company_idx on spy_assets(handler_company_id);
create index if not exists spy_assets_active_idx on spy_assets(is_active) where is_active = true;

-- ─── SPY INTEL ────────────────────────────────────────────────────────────────

create table if not exists spy_intel (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references spy_assets(id) on delete cascade,
  claim_id    uuid references turf_claims(id) on delete cascade,
  intel_type  spy_intel_type not null,
  content     text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists spy_intel_asset_idx on spy_intel(asset_id);
create index if not exists spy_intel_claim_idx on spy_intel(claim_id);
create index if not exists spy_intel_active_idx on spy_intel(expires_at);

-- ─── SPY CULTIVATIONS ─────────────────────────────────────────────────────────

create table if not exists spy_cultivations (
  id                    uuid primary key default gen_random_uuid(),
  cultivator_type       text not null check (cultivator_type in ('org', 'hessian_company')),
  cultivator_org_id     uuid references greek_orgs(id) on delete cascade,
  cultivator_company_id uuid references hessian_companies(id) on delete cascade,
  target_user_id        uuid not null references auth.users(id) on delete cascade,
  offer_type            cultivation_offer_type not null,
  offer_detail          text not null default '',
  status                cultivation_status not null default 'pending',
  intel_quality_rating  int,
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  constraint spy_cultivations_rating_check check (
    intel_quality_rating is null or (intel_quality_rating >= 1 and intel_quality_rating <= 5)
  )
);

create index if not exists spy_cultivations_target_idx on spy_cultivations(target_user_id);
create index if not exists spy_cultivations_cultivator_org_idx on spy_cultivations(cultivator_org_id);
create index if not exists spy_cultivations_status_idx on spy_cultivations(status);

-- ─── MOLE HUNTS ───────────────────────────────────────────────────────────────

create table if not exists mole_hunts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references greek_orgs(id) on delete cascade,
  fake_bar_id         uuid not null references venues(id) on delete cascade,
  fake_event_date     date not null,
  fake_claim_type     text not null check (fake_claim_type in ('sneak_attack', 'war_declaration')),
  status              mole_hunt_status not null default 'active',
  suspected_mole_id   uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists mole_hunts_org_idx on mole_hunts(org_id);
create index if not exists mole_hunts_status_idx on mole_hunts(status);

-- ─── GHOST PROFILES ───────────────────────────────────────────────────────────

create table if not exists ghost_profiles (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete cascade,
  codename                text not null unique,
  email                   text,
  original_invite_token   text,
  upgrade_eligible        boolean not null default false,
  reports_count           int not null default 0,
  created_at              timestamptz not null default now()
);

create index if not exists ghost_profiles_user_idx on ghost_profiles(user_id);

-- ─── GHOST REPORTS ────────────────────────────────────────────────────────────

create table if not exists ghost_reports (
  id                  uuid primary key default gen_random_uuid(),
  ghost_id            uuid not null references ghost_profiles(id) on delete cascade,
  claim_id            uuid references turf_claims(id) on delete cascade,
  bar_id              uuid references venues(id) on delete cascade,
  observation         text not null,
  orgs_present        text,
  headcount_estimate  int,
  quality_rating      int,
  created_at          timestamptz not null default now(),
  constraint ghost_reports_rating_check check (
    quality_rating is null or (quality_rating >= 1 and quality_rating <= 5)
  )
);

create index if not exists ghost_reports_ghost_idx on ghost_reports(ghost_id);

-- ─── SPY BADGES ───────────────────────────────────────────────────────────────

create table if not exists spy_badges (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  badge_type        spy_badge_type not null,
  awarded_at        timestamptz not null default now(),
  awarded_by_org_id uuid references greek_orgs(id) on delete set null,
  detail            text not null default '',
  unique (user_id, badge_type)
);

create index if not exists spy_badges_user_idx on spy_badges(user_id);

-- ─── BAR EMPLOYEE ASSET FLAG ──────────────────────────────────────────────────

alter table bar_admins
  add column if not exists is_bar_asset boolean not null default false;

-- ─── RLS ───────────────────────────────────────────────────────────────────────

alter table spy_recruitments  enable row level security;
alter table spy_assets        enable row level security;
alter table spy_intel         enable row level security;
alter table spy_cultivations  enable row level security;
alter table mole_hunts        enable row level security;
alter table ghost_profiles    enable row level security;
alter table ghost_reports     enable row level security;
alter table spy_badges        enable row level security;

-- spy_recruitments: target sees their own; service role handles insert
drop policy if exists "read own recruitments" on spy_recruitments;
create policy "read own recruitments" on spy_recruitments
  for select to authenticated using (target_user_id = auth.uid());

drop policy if exists "respond own recruitment" on spy_recruitments;
create policy "respond own recruitment" on spy_recruitments
  for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

-- spy_assets: asset sees own; handler org/company sees their assets
drop policy if exists "read own spy assets" on spy_assets;
create policy "read own spy assets" on spy_assets
  for select to authenticated
  using (
    asset_user_id = auth.uid()
    or exists (select 1 from org_memberships m where m.org_id = spy_assets.handler_org_id and m.user_id = auth.uid() and m.verified = true)
    or exists (select 1 from hessian_companies c where c.id = spy_assets.handler_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "update own spy assets" on spy_assets;
create policy "update own spy assets" on spy_assets
  for update to authenticated
  using (
    asset_user_id = auth.uid()
    or exists (select 1 from org_memberships m where m.org_id = spy_assets.handler_org_id and m.user_id = auth.uid() and m.verified = true)
  )
  with check (
    asset_user_id = auth.uid()
    or exists (select 1 from org_memberships m where m.org_id = spy_assets.handler_org_id and m.user_id = auth.uid() and m.verified = true)
  );

-- spy_intel: asset and handler can read
drop policy if exists "read own spy intel" on spy_intel;
create policy "read own spy intel" on spy_intel
  for select to authenticated
  using (
    exists (select 1 from spy_assets a where a.id = spy_intel.asset_id and a.asset_user_id = auth.uid())
    or exists (select 1 from spy_assets a
      join org_memberships m on m.org_id = a.handler_org_id
      where a.id = spy_intel.asset_id and m.user_id = auth.uid() and m.verified = true)
    or exists (select 1 from spy_assets a
      join hessian_companies c on c.id = a.handler_company_id
      where a.id = spy_intel.asset_id and c.captain_id = auth.uid())
  );

drop policy if exists "insert spy intel as asset" on spy_intel;
create policy "insert spy intel as asset" on spy_intel
  for insert to authenticated
  with check (
    exists (select 1 from spy_assets a where a.id = spy_intel.asset_id and a.asset_user_id = auth.uid())
  );

-- spy_cultivations: target and cultivator can read
drop policy if exists "read own cultivations" on spy_cultivations;
create policy "read own cultivations" on spy_cultivations
  for select to authenticated
  using (
    target_user_id = auth.uid()
    or exists (select 1 from org_memberships m where m.org_id = spy_cultivations.cultivator_org_id and m.user_id = auth.uid() and m.verified = true)
    or exists (select 1 from hessian_companies c where c.id = spy_cultivations.cultivator_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "respond cultivation as target" on spy_cultivations;
create policy "respond cultivation as target" on spy_cultivations
  for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

-- mole_hunts: org leadership read
drop policy if exists "read org mole hunts" on mole_hunts;
create policy "read org mole hunts" on mole_hunts
  for select to authenticated
  using (
    exists (select 1 from org_memberships m where m.org_id = mole_hunts.org_id and m.user_id = auth.uid() and m.verified = true)
  );

-- ghost_profiles: self read; public can see codename only via service role
drop policy if exists "read own ghost profile" on ghost_profiles;
create policy "read own ghost profile" on ghost_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "insert own ghost profile" on ghost_profiles;
create policy "insert own ghost profile" on ghost_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own ghost profile" on ghost_profiles;
create policy "update own ghost profile" on ghost_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ghost_reports: ghost self insert + read; platform can read via service role
drop policy if exists "read own ghost reports" on ghost_reports;
create policy "read own ghost reports" on ghost_reports
  for select to authenticated
  using (
    exists (select 1 from ghost_profiles g where g.id = ghost_reports.ghost_id and g.user_id = auth.uid())
  );

drop policy if exists "insert own ghost reports" on ghost_reports;
create policy "insert own ghost reports" on ghost_reports
  for insert to authenticated
  with check (
    exists (select 1 from ghost_profiles g where g.id = ghost_reports.ghost_id and g.user_id = auth.uid())
  );

-- spy_badges: public read (display credentials), self insert via service role
drop policy if exists "public read spy badges" on spy_badges;
create policy "public read spy badges" on spy_badges
  for select to anon, authenticated using (true);