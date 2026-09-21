/*
# Turf Wars Phase 5 — The Hessians: Independent Mercenary Factions

## Overview
Adds Hessian Companies — independent groups of 5+ non-Greek users who operate
as neutral mercenaries. They can occupy neutral bars, ambush vulnerable Greek
turf, take contracts from Greek orgs, and execute Double Crosses.

## New Tables

### hessian_companies
Independent mercenary factions. No Greek affiliation required.
- id, name (creative company name), captain_id (user who controls it),
  member_count (int, maintained as denormalized count),
  reputation_score (int, starts at 0 — positive for loyalty, negative for betrayals),
  betrayals (int, total double crosses executed),
  contracts_completed (int, total contracts fulfilled honorably),
  ambushes_won (int, total successful ambushes),
  occupied_bar_id (nullable — current bar they're occupying),
  occupation_expires_at (nullable — 7-day occupation timer),
  created_at

### hessian_members
Members of a Hessian Company. Must be non-Greek-affiliated (no verified org membership).
- id, company_id, user_id, role ('captain' | 'member'),
  joined_at, verified (boolean)

### hessian_contracts
A formal hiring agreement between a Greek org and a Hessian Company for a specific event.
- id, org_id (hiring org), company_id, claim_id (the event),
  side ('attacker' | 'defender' — which side they're contracted for),
  status ('pending' | 'accepted' | 'rejected' | 'completed' | 'betrayed'),
  agreed_weight (numeric — 0.75 for Hessians, better than 0.5 allies),
  double_cross_org_id (nullable — if betrayed, which rival org they actually helped),
  double_cross_executed_at (nullable),
  created_at, resolved_at

### hessian_ambushes
Records of Hessian ambushes on Greek turf.
- id, company_id, target_bar_id, target_org_id (the Greek org holding the bar),
  status ('declared' | 'live' | 'successful' | 'failed' | 'repelled'),
  window_open_at, window_close_at (90-min window),
  hessian_headcount (int — verified Hessian check-ins during the window),
  required_headcount (int — 10 or 80% of roster, whichever is lower),
  created_at, resolved_at

## Modified Tables

### greek_orgs — contested status from ambushes
- turf_contested_until (timestamptz, nullable — if set, turf is in Contested
  Status and rival orgs can file accelerated War Declarations)

### venues — occupied territory display
- occupied_by_company_id (uuid, nullable — references hessian_companies)
- occupation_expires_at (timestamptz, nullable)

## Security
- hessian_companies: public read, authenticated insert (captain creates)
- hessian_members: public read, authenticated insert (self-join with captain approval)
- hessian_contracts: public read (visible reputation), org/company insert
- hessian_ambushes: public read, captain insert
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

do $$ begin
  create type hessian_member_role as enum ('captain', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type contract_status as enum ('pending', 'accepted', 'rejected', 'completed', 'betrayed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type contract_side as enum ('attacker', 'defender');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type ambush_status as enum ('declared', 'live', 'successful', 'failed', 'repelled');
exception when duplicate_object then null;
end $$;

-- ─── HESSIAN COMPANIES ────────────────────────────────────────────────────────

create table if not exists hessian_companies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  captain_id            uuid not null references auth.users(id) on delete cascade,
  member_count          int not null default 1,
  reputation_score      int not null default 0,
  betrayals             int not null default 0,
  contracts_completed   int not null default 0,
  ambushes_won          int not null default 0,
  occupied_bar_id       uuid references venues(id) on delete set null,
  occupation_expires_at timestamptz,
  created_at            timestamptz not null default now(),
  unique (name)
);

create index if not exists hessian_companies_captain_idx on hessian_companies(captain_id);
create index if not exists hessian_companies_reputation_idx on hessian_companies(reputation_score desc);

-- ─── HESSIAN MEMBERS ──────────────────────────────────────────────────────────

create table if not exists hessian_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references hessian_companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        hessian_member_role not null default 'member',
  joined_at   timestamptz not null default now(),
  verified    boolean not null default false,
  unique (company_id, user_id)
);

create index if not exists hessian_members_company_idx on hessian_members(company_id);
create index if not exists hessian_members_user_idx on hessian_members(user_id);

-- ─── HESSIAN CONTRACTS ────────────────────────────────────────────────────────

create table if not exists hessian_contracts (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references greek_orgs(id) on delete cascade,
  company_id              uuid not null references hessian_companies(id) on delete cascade,
  claim_id                uuid references turf_claims(id) on delete cascade,
  side                    contract_side not null,
  status                  contract_status not null default 'pending',
  agreed_weight           numeric(3,2) not null default 0.75,
  double_cross_org_id     uuid references greek_orgs(id) on delete set null,
  double_cross_executed_at timestamptz,
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz
);

create index if not exists hessian_contracts_org_idx on hessian_contracts(org_id);
create index if not exists hessian_contracts_company_idx on hessian_contracts(company_id);
create index if not exists hessian_contracts_claim_idx on hessian_contracts(claim_id);
create index if not exists hessian_contracts_status_idx on hessian_contracts(status);

-- ─── HESSIAN AMBUSHES ─────────────────────────────────────────────────────────

create table if not exists hessian_ambushes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references hessian_companies(id) on delete cascade,
  target_bar_id       uuid not null references venues(id) on delete cascade,
  target_org_id       uuid not null references greek_orgs(id) on delete cascade,
  status              ambush_status not null default 'declared',
  window_open_at      timestamptz not null,
  window_close_at     timestamptz not null,
  hessian_headcount   int not null default 0,
  required_headcount  int not null default 10,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint hessian_ambush_window_valid check (window_close_at > window_open_at)
);

create index if not exists hessian_ambushes_company_idx on hessian_ambushes(company_id);
create index if not exists hessian_ambushes_bar_idx on hessian_ambushes(target_bar_id);
create index if not exists hessian_ambushes_status_idx on hessian_ambushes(status);

-- ─── GREEK ORGS: Contested status ─────────────────────────────────────────────

alter table greek_orgs
  add column if not exists turf_contested_until timestamptz;

-- ─── VENUES: Occupied territory ───────────────────────────────────────────────

alter table venues
  add column if not exists occupied_by_company_id uuid references hessian_companies(id) on delete set null,
  add column if not exists occupation_expires_at   timestamptz;

-- ─── HESSIAN COMPANY REPUTATION VIEW ──────────────────────────────────────────

create or replace view hessian_reputation as
  select
    id, name, member_count, reputation_score,
    betrayals, contracts_completed, ambushes_won,
    case when contracts_completed + betrayals > 0
      then round(contracts_completed::numeric / (contracts_completed + betrayals) * 100, 1)
      else null end as loyalty_rate,
    occupied_bar_id,
    occupation_expires_at,
    created_at
  from hessian_companies
  order by reputation_score desc;

-- ─── RLS ───────────────────────────────────────────────────────────────────────

alter table hessian_companies enable row level security;
alter table hessian_members   enable row level security;
alter table hessian_contracts enable row level security;
alter table hessian_ambushes  enable row level security;

-- hessian_companies: public read, authenticated insert (captain creates own)
drop policy if exists "public read hessian_companies" on hessian_companies;
create policy "public read hessian_companies" on hessian_companies for select
  to anon, authenticated using (true);

drop policy if exists "auth insert hessian_companies" on hessian_companies;
create policy "auth insert hessian_companies" on hessian_companies for insert
  to authenticated with check (captain_id = auth.uid());

drop policy if exists "captain update hessian_companies" on hessian_companies;
create policy "captain update hessian_companies" on hessian_companies for update
  to authenticated
  using (captain_id = auth.uid())
  with check (captain_id = auth.uid());

-- hessian_members: public read, self-insert (join request), captain update (approve)
drop policy if exists "public read hessian_members" on hessian_members;
create policy "public read hessian_members" on hessian_members for select
  to anon, authenticated using (true);

drop policy if exists "self insert hessian_members" on hessian_members;
create policy "self insert hessian_members" on hessian_members for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "captain update hessian_members" on hessian_members;
create policy "captain update hessian_members" on hessian_members for update
  to authenticated
  using (
    exists (select 1 from hessian_companies c
      where c.id = hessian_members.company_id
        and c.captain_id = auth.uid())
  )
  with check (
    exists (select 1 from hessian_companies c
      where c.id = hessian_members.company_id
        and c.captain_id = auth.uid())
  );

-- hessian_contracts: public read (reputation transparency), org/company insert+update
drop policy if exists "public read hessian_contracts" on hessian_contracts;
create policy "public read hessian_contracts" on hessian_contracts for select
  to anon, authenticated using (true);

drop policy if exists "auth insert hessian_contracts" on hessian_contracts;
create policy "auth insert hessian_contracts" on hessian_contracts for insert
  to authenticated with check (true);

drop policy if exists "auth update hessian_contracts" on hessian_contracts;
create policy "auth update hessian_contracts" on hessian_contracts for update
  to authenticated
  using (
    exists (select 1 from hessian_companies c
      where c.id = hessian_contracts.company_id
        and c.captain_id = auth.uid())
    or exists (select 1 from org_memberships m
      where m.org_id = hessian_contracts.org_id
        and m.user_id = auth.uid() and m.verified = true)
  )
  with check (
    exists (select 1 from hessian_companies c
      where c.id = hessian_contracts.company_id
        and c.captain_id = auth.uid())
    or exists (select 1 from org_memberships m
      where m.org_id = hessian_contracts.org_id
        and m.user_id = auth.uid() and m.verified = true)
  );

-- hessian_ambushes: public read, captain insert+update
drop policy if exists "public read hessian_ambushes" on hessian_ambushes;
create policy "public read hessian_ambushes" on hessian_ambushes for select
  to anon, authenticated using (true);

drop policy if exists "captain insert hessian_ambushes" on hessian_ambushes;
create policy "captain insert hessian_ambushes" on hessian_ambushes for insert
  to authenticated
  with check (
    exists (select 1 from hessian_companies c
      where c.id = hessian_ambushes.company_id
        and c.captain_id = auth.uid())
  );

drop policy if exists "captain update hessian_ambushes" on hessian_ambushes;
create policy "captain update hessian_ambushes" on hessian_ambushes for update
  to authenticated
  using (
    exists (select 1 from hessian_companies c
      where c.id = hessian_ambushes.company_id
        and c.captain_id = auth.uid())
  )
  with check (
    exists (select 1 from hessian_companies c
      where c.id = hessian_ambushes.company_id
        and c.captain_id = auth.uid())
  );