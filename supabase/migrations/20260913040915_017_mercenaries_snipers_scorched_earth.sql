/*
# Turf Wars Phase 8 — Mercenaries, Snipers & Scorched Earth

## Overview
Final layer: solo no-loyalty Mercenaries with War Bond economy, Sniper
targeted disruption with consent architecture, and Scorched Earth graduation
events for seniors going out with a bang.

## New Tables

### mercenaries
Solo anonymous contractors. No company, no reputation beyond execution rate.
- id, user_id (the mercenary — kept private from hirers)
- is_active (boolean)
- is_anonymous (boolean — default true, hides identity in the exchange)
- contracts_completed (int)
- contracts_failed (int)
- war_bonds (int — platform currency earned through contracts)
- sniper_eligible (boolean — opt-in to being sniped, default false)
- is_sniper (boolean — specialized mercenary role)
- created_at

### mercenary_contracts
Single-event hiring of a mercenary for a tactical role.
- id, mercenary_id, hirer_type ('org' | 'hessian_company')
- hirer_org_id, hirer_company_id (nullable)
- claim_id (nullable — the event, if tied to one)
- role: 'headcount_filler' | 'intel_extraction' | 'disinformation' | 'distraction'
- status: 'pending' | 'accepted' | 'completed' | 'failed' | 'rejected'
- war_bond_reward (int — bonds earned on completion)
- distraction_decoy_bar_id (nullable — for distraction contracts)
- distraction_partner_id (nullable — second mercenary for distraction)
- created_at, resolved_at

### sniper_contracts
Targeted disruption contracts against consenting high-value players.
- id, sniper_id (mercenary id)
- target_user_id (must have sniper_eligible = true)
- hirer_org_id, hirer_company_id (nullable)
- claim_id (nullable — the event context)
- status: 'pending' | 'active' | 'successful' | 'failed' | 'expired'
- tactics_used (text — log of disinformation sent)
- created_at, resolved_at

### scorched_earth_events
Graduation night spectacle — one-time, one-night, platform-level event.
- id, senior_user_id
- codename (text — their public identity for the event, like a mercenary)
- target_bar_id
- event_date (date — the night of the scorched earth)
- side: 'self' | 'attacker' | 'defender' — who they fight for
- allied_org_id (nullable — if fighting for an org)
- allied_company_id (nullable — if fighting with a Hessian company)
- status: 'announced' | 'live' | 'victorious' | 'defeated'
- war_bond_reward (int — bonus bonds for participating)
- created_at, resolved_at

### war_bond_ledger
Transaction log for War Bond currency.
- id, user_id, amount (positive = earned, negative = spent)
- reason: 'contract_completed' | 'distraction_success' | 'sniper_success' |
           'scorched_earth_victory' | 'scorched_earth_participation' |
           'bar_special_redemption' | 'loyalty_tier_upgrade' | 'hessian_formation_credit'
- reference_id (nullable — links to the contract/event that earned it)
- created_at

## Modified Tables

### profiles (or auth.users metadata)
No schema change needed — sniper_eligible is tracked on the mercenaries table.
If a user isn't a mercenary but wants to be sniper-eligible, they can set the
flag when creating their mercenary profile.

## Security
- mercenaries: self read + write; exchange listing is via API (service role
  strips identity for anonymous mercenaries)
- mercenary_contracts: mercenary and hirer can read; respective insert
- sniper_contracts: sniper and hirer can read; hirer insert
- scorched_earth_events: public read (platform-level spectacle), self insert
- war_bond_ledger: self read only; service role inserts
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

do $$ begin
  create type mercenary_role as enum ('headcount_filler', 'intel_extraction', 'disinformation', 'distraction');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type mercenary_contract_status as enum ('pending', 'accepted', 'completed', 'failed', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type sniper_contract_status as enum ('pending', 'active', 'successful', 'failed', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type scorched_earth_status as enum ('announced', 'live', 'victorious', 'defeated');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type scorched_earth_side as enum ('self', 'attacker', 'defender');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type war_bond_reason as enum (
    'contract_completed', 'distraction_success', 'sniper_success',
    'scorched_earth_victory', 'scorched_earth_participation',
    'bar_special_redemption', 'loyalty_tier_upgrade', 'hessian_formation_credit'
  );
exception when duplicate_object then null;
end $$;

-- ─── MERCENARIES ──────────────────────────────────────────────────────────────

create table if not exists mercenaries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  is_active           boolean not null default true,
  is_anonymous        boolean not null default true,
  contracts_completed int not null default 0,
  contracts_failed    int not null default 0,
  war_bonds           int not null default 0,
  sniper_eligible     boolean not null default false,
  is_sniper           boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists mercenaries_active_idx on mercenaries(is_active) where is_active = true;
create index if not exists mercenaries_sniper_eligible_idx on mercenaries(sniper_eligible) where sniper_eligible = true;

-- ─── MERCENARY CONTRACTS ──────────────────────────────────────────────────────

create table if not exists mercenary_contracts (
  id                        uuid primary key default gen_random_uuid(),
  mercenary_id              uuid not null references mercenaries(id) on delete cascade,
  hirer_type                text not null check (hirer_type in ('org', 'hessian_company')),
  hirer_org_id              uuid references greek_orgs(id) on delete cascade,
  hirer_company_id          uuid references hessian_companies(id) on delete cascade,
  claim_id                  uuid references turf_claims(id) on delete cascade,
  role                      mercenary_role not null,
  status                    mercenary_contract_status not null default 'pending',
  war_bond_reward           int not null default 5,
  distraction_decoy_bar_id  uuid references venues(id) on delete set null,
  distraction_partner_id    uuid references mercenaries(id) on delete set null,
  created_at                timestamptz not null default now(),
  resolved_at               timestamptz
);

create index if not exists merc_contracts_merc_idx on mercenary_contracts(mercenary_id);
create index if not exists merc_contracts_hirer_org_idx on mercenary_contracts(hirer_org_id);
create index if not exists merc_contracts_status_idx on mercenary_contracts(status);

-- ─── SNIPER CONTRACTS ─────────────────────────────────────────────────────────

create table if not exists sniper_contracts (
  id              uuid primary key default gen_random_uuid(),
  sniper_id       uuid not null references mercenaries(id) on delete cascade,
  target_user_id  uuid not null references auth.users(id) on delete cascade,
  hirer_org_id    uuid references greek_orgs(id) on delete cascade,
  hirer_company_id uuid references hessian_companies(id) on delete cascade,
  claim_id        uuid references turf_claims(id) on delete cascade,
  status          sniper_contract_status not null default 'pending',
  tactics_used    text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists sniper_contracts_sniper_idx on sniper_contracts(sniper_id);
create index if not exists sniper_contracts_target_idx on sniper_contracts(target_user_id);
create index if not exists sniper_contracts_status_idx on sniper_contracts(status);

-- ─── SCORCHED EARTH EVENTS ────────────────────────────────────────────────────

create table if not exists scorched_earth_events (
  id                  uuid primary key default gen_random_uuid(),
  senior_user_id      uuid not null references auth.users(id) on delete cascade,
  codename            text not null,
  target_bar_id       uuid not null references venues(id) on delete cascade,
  event_date          date not null,
  side                scorched_earth_side not null default 'self',
  allied_org_id       uuid references greek_orgs(id) on delete set null,
  allied_company_id   uuid references hessian_companies(id) on delete set null,
  status              scorched_earth_status not null default 'announced',
  war_bond_reward     int not null default 20,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists scorched_earth_date_idx on scorched_earth_events(event_date);
create index if not exists scorched_earth_status_idx on scorched_earth_events(status);

-- ─── WAR BOND LEDGER ──────────────────────────────────────────────────────────

create table if not exists war_bond_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        int not null,
  reason        war_bond_reason not null,
  reference_id  uuid,
  created_at    timestamptz not null default now()
);

create index if not exists war_bond_ledger_user_idx on war_bond_ledger(user_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────────

alter table mercenaries           enable row level security;
alter table mercenary_contracts   enable row level security;
alter table sniper_contracts      enable row level security;
alter table scorched_earth_events enable row level security;
alter table war_bond_ledger       enable row level security;

-- mercenaries: self read + update; insert self
drop policy if exists "read own mercenary" on mercenaries;
create policy "read own mercenary" on mercenaries
  for select to authenticated
  using (user_id = auth.uid() or is_active = true);

drop policy if exists "insert own mercenary" on mercenaries;
create policy "insert own mercenary" on mercenaries
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own mercenary" on mercenaries;
create policy "update own mercenary" on mercenaries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- mercenary_contracts: mercenary and hirer can read
drop policy if exists "read mercenary contracts" on mercenary_contracts;
create policy "read mercenary contracts" on mercenary_contracts
  for select to authenticated
  using (
    exists (select 1 from mercenaries m where m.id = mercenary_contracts.mercenary_id and m.user_id = auth.uid())
    or exists (select 1 from org_memberships om where om.org_id = mercenary_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
    or exists (select 1 from hessian_companies c where c.id = mercenary_contracts.hirer_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "insert mercenary contracts" on mercenary_contracts;
create policy "insert mercenary contracts" on mercenary_contracts
  for insert to authenticated
  with check (
    exists (select 1 from org_memberships om where om.org_id = mercenary_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
    or exists (select 1 from hessian_companies c where c.id = mercenary_contracts.hirer_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "update mercenary contracts as mercenary" on mercenary_contracts;
create policy "update mercenary contracts as mercenary" on mercenary_contracts
  for update to authenticated
  using (
    exists (select 1 from mercenaries m where m.id = mercenary_contracts.mercenary_id and m.user_id = auth.uid())
    or exists (select 1 from org_memberships om where om.org_id = mercenary_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
  )
  with check (
    exists (select 1 from mercenaries m where m.id = mercenary_contracts.mercenary_id and m.user_id = auth.uid())
    or exists (select 1 from org_memberships om where om.org_id = mercenary_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
  );

-- sniper_contracts: sniper and hirer read; hirer insert; sniper update
drop policy if exists "read sniper contracts" on sniper_contracts;
create policy "read sniper contracts" on sniper_contracts
  for select to authenticated
  using (
    exists (select 1 from mercenaries m where m.id = sniper_contracts.sniper_id and m.user_id = auth.uid())
    or target_user_id = auth.uid()
    or exists (select 1 from org_memberships om where om.org_id = sniper_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
    or exists (select 1 from hessian_companies c where c.id = sniper_contracts.hirer_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "insert sniper contracts" on sniper_contracts;
create policy "insert sniper contracts" on sniper_contracts
  for insert to authenticated
  with check (
    exists (select 1 from org_memberships om where om.org_id = sniper_contracts.hirer_org_id and om.user_id = auth.uid() and om.verified = true)
    or exists (select 1 from hessian_companies c where c.id = sniper_contracts.hirer_company_id and c.captain_id = auth.uid())
  );

drop policy if exists "update sniper contracts as sniper" on sniper_contracts;
create policy "update sniper contracts as sniper" on sniper_contracts
  for update to authenticated
  using (
    exists (select 1 from mercenaries m where m.id = sniper_contracts.sniper_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from mercenaries m where m.id = sniper_contracts.sniper_id and m.user_id = auth.uid())
  );

-- scorched_earth_events: public read, self insert + update
drop policy if exists "public read scorched earth" on scorched_earth_events;
create policy "public read scorched earth" on scorched_earth_events
  for select to anon, authenticated using (true);

drop policy if exists "insert own scorched earth" on scorched_earth_events;
create policy "insert own scorched earth" on scorched_earth_events
  for insert to authenticated
  with check (senior_user_id = auth.uid());

drop policy if exists "update own scorched earth" on scorched_earth_events;
create policy "update own scorched earth" on scorched_earth_events
  for update to authenticated
  using (senior_user_id = auth.uid())
  with check (senior_user_id = auth.uid());

-- war_bond_ledger: self read only (service role handles all inserts)
drop policy if exists "read own war bonds" on war_bond_ledger;
create policy "read own war bonds" on war_bond_ledger
  for select to authenticated using (user_id = auth.uid());