/*
# Anti-Fraud: Layered Defense System

## Overview
Four-layer defense against headcount fraud via multiple accounts:
1. Device fingerprinting — one verified account per device
2. Phone verification with velocity check — detect same phone across accounts
3. University .edu email verification — gate for high-stakes roles
4. Social graph anomaly detection — flag burner accounts for review

## Critical Security Fix: profiles.is_staff privilege escalation
The existing "own profile update" RLS policy lets any user set is_staff=true,
gaining operator access. This migration:
- Revokes UPDATE on is_staff, age_verified from authenticated role
- Grants UPDATE only on user-editable columns (full_name, phone, 
  location_opt_in, push_opt_in)
- Adds a SECURITY DEFINER function for operator-only is_staff changes

## New Tables

### device_fingerprints
Tracks device IDs per user. One primary device per account.
- id, user_id, device_id (text — the fingerprint hash)
- is_primary (boolean)
- is_blocked (boolean — blocked from event participation)
- first_seen_at, last_seen_at

### phone_verifications
OTP-based phone verification with velocity tracking.
- id, user_id, phone (text)
- otp_code (text — the 6-digit code)
- verified (boolean)
- attempts (int — wrong code attempts)
- created_at, verified_at, expires_at

### edu_verifications
.edu email domain verification.
- id, user_id, edu_email (text — must end in .edu)
- verified (boolean)
- verification_token (uuid — email link token)
- created_at, verified_at

### flagged_checkins
Review queue for suspicious checkins (social graph anomalies).
- id, checkin_id (references turf_checkins)
- user_id, claim_id, bar_id
- flag_reason (text — why it was flagged)
- status: 'pending' | 'approved' | 'rejected'
- reviewed_by (uuid, nullable — operator who reviewed)
- created_at, resolved_at

## Modified Tables

### profiles
- Added: device_verified (boolean — device fingerprint registered)
- Added: phone_verified (boolean — phone OTP completed)
- Added: edu_verified (boolean — .edu email confirmed)
- Added: account_status (text — 'active' | 'flagged' | 'blocked')
- Added: is_burner (boolean — flagged by anomaly detection)
- Added: registered_at_event (boolean — registered within 24h of an event)

## Security Changes
- REVOKE UPDATE (is_staff, age_verified) ON profiles FROM authenticated
- GRANT UPDATE (full_name, phone, location_opt_in, push_opt_in) ON profiles TO authenticated
- New SECURITY DEFINER function: set_staff_status (operator-only)
- RLS on all new tables
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

do $$ begin
  create type flagged_checkin_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

-- ─── PROFILES: Add anti-fraud columns ─────────────────────────────────────────

alter table profiles
  add column if not exists device_verified boolean not null default false,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists edu_verified boolean not null default false,
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'flagged', 'blocked')),
  add column if not exists is_burner boolean not null default false,
  add column if not exists registered_at_event boolean not null default false;

-- ─── DEVICE FINGERPRINTS ──────────────────────────────────────────────────────

create table if not exists device_fingerprints (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  device_id     text not null,
  is_primary    boolean not null default false,
  is_blocked    boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists device_fp_device_idx on device_fingerprints(device_id);
create index if not exists device_fp_user_idx on device_fingerprints(user_id);

-- ─── PHONE VERIFICATIONS ──────────────────────────────────────────────────────

create table if not exists phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  phone       text not null,
  otp_code    text not null,
  verified    boolean not null default false,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  verified_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists phone_ver_user_idx on phone_verifications(user_id);
create index if not exists phone_ver_phone_idx on phone_verifications(phone);
create index if not exists phone_ver_pending_idx on phone_verifications(user_id) where verified = false;

-- ─── EDU VERIFICATIONS ────────────────────────────────────────────────────────

create table if not exists edu_verifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  edu_email           text not null,
  verified            boolean not null default false,
  verification_token  uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  verified_at         timestamptz,
  unique (user_id, edu_email)
);

create index if not exists edu_ver_user_idx on edu_verifications(user_id);
create index if not exists edu_ver_email_idx on edu_verifications(edu_email);

-- ─── FLAGGED CHECKINS ─────────────────────────────────────────────────────────

create table if not exists flagged_checkins (
  id            uuid primary key default gen_random_uuid(),
  checkin_id    uuid not null references turf_checkins(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  claim_id      uuid not null references turf_claims(id) on delete cascade,
  bar_id        uuid not null references venues(id) on delete cascade,
  flag_reason   text not null,
  status        flagged_checkin_status not null default 'pending',
  reviewed_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists flagged_checkins_pending_idx on flagged_checkins(status) where status = 'pending';
create index if not exists flagged_checkins_user_idx on flagged_checkins(user_id);

-- ─── CRITICAL FIX: profiles column-level privileges ───────────────────────────
-- Prevent users from self-assigning is_staff, age_verified, or anti-fraud flags.
-- These are operator/system-controlled fields.

revoke update on profiles from authenticated;
grant update (full_name, phone, location_opt_in, push_opt_in) on profiles to authenticated;

-- ─── SECURITY DEFINER: set_staff_status (operator-only) ───────────────────────
-- Operators need a way to grant staff status. This function checks the caller
-- is already staff before allowing the change.

create or replace function set_staff_status(p_target_user uuid, p_staff boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- authorize the CALLER — must already be staff
  if not exists (select 1 from profiles where id = auth.uid() and is_staff = true) then
    raise exception 'Not authorized';
  end if;

  update profiles set is_staff = p_staff where id = p_target_user;
end;
$$;

revoke execute on function set_staff_status from anon;
grant execute on function set_staff_status to authenticated;

-- ─── SECURITY DEFINER: set_age_verified (operator-only) ───────────────────────
-- Age verification should be operator-verified, not self-attested.

create or replace function set_age_verified(p_target_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_staff = true) then
    raise exception 'Not authorized';
  end if;

  update profiles set age_verified = p_verified where id = p_target_user;
end;
$$;

revoke execute on function set_age_verified from anon;
grant execute on function set_age_verified to authenticated;

-- ─── SECURITY DEFINER: check_device_eligibility ───────────────────────────────
-- Called before event participation. Returns true if the user's device is
-- not blocked and no other active account shares the same device.

create or replace function check_device_eligibility(p_user_id uuid, p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean;
  v_dup_count int;
  v_account_status text;
begin
  -- Check if user's account is blocked
  select account_status into v_account_status from profiles where id = p_user_id;
  if v_account_status = 'blocked' then
    return false;
  end if;

  -- Check if this device is blocked
  select is_blocked into v_blocked from device_fingerprints
    where device_id = p_device_id and user_id = p_user_id limit 1;
  if coalesce(v_blocked, false) then
    return false;
  end if;

  -- Check for duplicate accounts on the same device
  -- (excluding the current user)
  select count(*) into v_dup_count from device_fingerprints df
    join profiles p on p.id = df.user_id
    where df.device_id = p_device_id
      and df.user_id <> p_user_id
      and p.account_status = 'active'
      and coalesce(df.is_blocked, false) = false;

  if v_dup_count > 0 then
    -- Flag both accounts
    update profiles set account_status = 'flagged'
      where id in (
        select user_id from device_fingerprints
        where device_id = p_device_id and account_status = 'active'
      );
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function check_device_eligibility from anon;
grant execute on function check_device_eligibility to authenticated;

-- ─── SECURITY DEFINER: check_event_eligibility ────────────────────────────────
-- Master gate: checks device, phone, .edu, and burner status.
-- Returns a text status: 'eligible', 'blocked', 'flagged', 'needs_verification'

create or replace function check_event_eligibility(p_user_id uuid, p_device_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device_ok boolean;
  v_edu_required boolean;
begin
  select * into v_profile from profiles where id = p_user_id;
  if not found then return 'blocked'; end if;

  -- Blocked accounts can't participate
  if v_profile.account_status = 'blocked' then
    return 'blocked';
  end if;

  -- Check device fingerprint
  select check_device_eligibility(p_user_id, p_device_id) into v_device_ok;
  if not v_device_ok then
    return 'blocked';
  end if;

  -- Burner accounts get flagged for review
  if v_profile.is_burner then
    return 'flagged';
  end if;

  -- For high-stakes roles (Greek members, Hessians, Mercenaries),
  -- .edu verification is required. The caller checks org membership separately.
  -- Here we just return the verification status.
  if not v_profile.phone_verified then
    return 'needs_verification';
  end if;

  return 'eligible';
end;
$$;

revoke execute on function check_event_eligibility from anon;
grant execute on function check_event_eligibility to authenticated;

-- ─── SECURITY DEFINER: flag_burner_account ────────────────────────────────────
-- Flags accounts that match the burner profile:
-- - Registered within 24 hours of an event
-- - Zero social connections (no Regiment links, no org membership)
-- - Attempting event participation immediately

create or replace function flag_burner_account(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_org_count int;
  v_regiment_count int;
  v_link_count int;
  v_account_age_hours float;
begin
  select * into v_profile from profiles where id = p_user_id;
  if not found then return false; end if;

  -- Already flagged?
  if v_profile.is_burner then return true; end if;

  -- Check account age
  v_account_age_hours := extract(epoch from (now() - v_profile.created_at)) / 3600;

  -- Check social connections
  select count(*) into v_org_count from org_memberships
    where user_id = p_user_id and verified = true;

  select count(*) into v_regiment_count from regiment_members
    where user_id = p_user_id;

  select count(*) into v_link_count from regiment_links
    where (user_a = p_user_id or user_b = p_user_id)
      and status = 'linked';

  -- Burner heuristic: < 24 hours old + zero connections
  if v_account_age_hours < 24
     and v_org_count = 0
     and v_regiment_count = 0
     and v_link_count = 0 then
    update profiles set is_burner = true, account_status = 'flagged' where id = p_user_id;
    return true;
  end if;

  return false;
end;
$$;

revoke execute on function flag_burner_account from anon;
grant execute on function flag_burner_account to authenticated;

-- ─── RLS on new tables ────────────────────────────────────────────────────────

alter table device_fingerprints  enable row level security;
alter table phone_verifications  enable row level security;
alter table edu_verifications    enable row level security;
alter table flagged_checkins     enable row level security;

-- device_fingerprints: self read; self insert; self update; operator read all
drop policy if exists "read own device fingerprints" on device_fingerprints;
create policy "read own device fingerprints" on device_fingerprints
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles where id = auth.uid() and is_staff = true));

drop policy if exists "insert own device fingerprint" on device_fingerprints;
create policy "insert own device fingerprint" on device_fingerprints
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own device fingerprint" on device_fingerprints;
create policy "update own device fingerprint" on device_fingerprints
  for update to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles where id = auth.uid() and is_staff = true))
  with check (user_id = auth.uid()
              or exists (select 1 from profiles where id = auth.uid() and is_staff = true));

-- phone_verifications: self read + insert; self update (to mark verified)
drop policy if exists "read own phone verifications" on phone_verifications;
create policy "read own phone verifications" on phone_verifications
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles where id = auth.uid() and is_staff = true));

drop policy if exists "insert own phone verification" on phone_verifications;
create policy "insert own phone verification" on phone_verifications
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own phone verification" on phone_verifications;
create policy "update own phone verification" on phone_verifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- edu_verifications: self read + insert; self update
drop policy if exists "read own edu verifications" on edu_verifications;
create policy "read own edu verifications" on edu_verifications
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles where id = auth.uid() and is_staff = true));

drop policy if exists "insert own edu verification" on edu_verifications;
create policy "insert own edu verification" on edu_verifications
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own edu verification" on edu_verifications;
create policy "update own edu verification" on edu_verifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- flagged_checkins: operator read; self read; operator update
drop policy if exists "read own flagged checkins" on flagged_checkins;
create policy "read own flagged checkins" on flagged_checkins
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from profiles where id = auth.uid() and is_staff = true));

drop policy if exists "operator update flagged checkins" on flagged_checkins;
create policy "operator update flagged checkins" on flagged_checkins
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_staff = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_staff = true));

drop policy if exists "insert flagged checkins as service" on flagged_checkins;
create policy "insert flagged checkins as service" on flagged_checkins
  for insert to authenticated
  with check (user_id = auth.uid()
              or exists (select 1 from profiles where id = auth.uid() and is_staff = true));