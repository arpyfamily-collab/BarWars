-- Item 11 + .edu gate (Brian, Sep 28): roles only, @olemiss.edu only for the Oxford pilot, off for now
-- behind a staff switch. When on: one confirmed @olemiss.edu login = one account for anything that can
-- move a war (Greek and Hessian membership, war check-ins, headcount mercenaries). Bar employees invited
-- secretly by their bar may be Ghosts, spies and support mercenaries without .edu, never more.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('edu_gate', '{"enabled": false, "domains": ["olemiss.edu"]}')
on conflict (key) do nothing;

-- Verified .edu = the account's confirmed login email is on an allowed domain (one .edu, one account)
create or replace function public.edu_email_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u, public.app_settings s
                  where u.id = p_user and s.key = 'edu_gate' and u.email_confirmed_at is not null
                    and lower(split_part(u.email, '@', 2)) in (select lower(jsonb_array_elements_text(s.value->'domains'))));
$$;

create or replace function public.edu_gate_passes(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'edu_gate'), false)
      or exists (select 1 from public.profiles where id = p_user and (is_staff or coalesce(is_tester, false)))
      or public.edu_email_ok(p_user);
$$;

-- Keep profiles.edu_verified in step with the login email (it was settable through a leaked dev link)
create or replace function public.tg_sync_edu_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set edu_verified = public.edu_email_ok(new.id) where id = new.id;
  return new;
end $$;
drop trigger if exists sync_edu_verified on auth.users;
create trigger sync_edu_verified after update of email, email_confirmed_at on auth.users
  for each row execute function public.tg_sync_edu_verified();
update public.profiles p set edu_verified = public.edu_email_ok(p.id);

-- ── Secret bar-staff invites (item 11): single-use, 72 hours, 3 per bar per semester
create table if not exists public.bar_staff_invites (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  employee_name text not null check (char_length(employee_name) between 2 and 60),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '72 hours',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.bar_staff_invites enable row level security;
create table if not exists public.bar_sponsored_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  invite_id uuid references public.bar_staff_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.bar_sponsored_accounts enable row level security;   -- no policies: server and staff only

create or replace function public.semester_start(p_at timestamptz default now())
returns date language sql stable as $$
  select case when extract(month from p_at at time zone 'America/Chicago') >= 8
              then make_date(extract(year from p_at at time zone 'America/Chicago')::int, 8, 1)
              else make_date(extract(year from p_at at time zone 'America/Chicago')::int, 1, 1) end;
$$;

create or replace function public.create_staff_invite(p_user uuid, p_venue uuid, p_name text, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare n int; inv uuid;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  perform 1 from public.venues where id = p_venue for update;
  select count(*) into n from public.bar_staff_invites
   where venue_id = p_venue and created_at >= public.semester_start() and revoked_at is null
     and (used_at is not null or expires_at > now());
  if n >= 3 then raise exception 'INVITE_CAP'; end if;
  insert into public.bar_staff_invites (venue_id, created_by, employee_name, token_hash)
  values (p_venue, p_user, btrim(p_name), md5(p_token)) returning id into inv;
  return json_build_object('id', inv, 'left', 2 - n);
end $$;

create or replace function public.claim_staff_invite(p_user uuid, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.bar_staff_invites where token_hash = md5(p_token) for update;
  if not found or i.revoked_at is not null or i.used_at is not null or i.expires_at <= now() then raise exception 'INVITE_INVALID'; end if;
  if not exists (select 1 from public.profiles where id = p_user and age_verified) then raise exception 'AGE_REQUIRED'; end if;
  if exists (select 1 from public.bar_sponsored_accounts where user_id = p_user) then raise exception 'ALREADY_SPONSORED'; end if;
  update public.bar_staff_invites set used_by = p_user, used_at = now() where id = i.id;
  insert into public.bar_sponsored_accounts (user_id, venue_id, invite_id) values (p_user, i.venue_id, i.id);
  return json_build_object('ok', true);
end $$;

create or replace function public.revoke_staff_invite(p_user uuid, p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.bar_staff_invites where id = p_invite;
  if not found or not public.is_bar_admin(p_user, i.venue_id) then raise exception 'NOT_BAR_ADMIN'; end if;
  update public.bar_staff_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
  update public.bar_sponsored_accounts set revoked_at = coalesce(revoked_at, now()) where invite_id = p_invite;
end $$;

create or replace function public.bar_sponsored(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bar_sponsored_accounts where user_id = p_user and revoked_at is null);
$$;

-- ── The gate itself, in the database so no route can skip it
create or replace function public.tg_edu_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid; strict_role boolean := true; msg text;
begin
  if tg_table_name = 'org_memberships' then
    if not new.verified then return new; end if; u := new.user_id; msg := 'join a Greek org';
  elsif tg_table_name = 'hessian_members' then
    if not new.verified then return new; end if; u := new.user_id; msg := 'join a Hessian company';
  elsif tg_table_name = 'turf_checkins' then
    u := new.user_id; msg := 'check in to a war';
  elsif tg_table_name = 'ghost_profiles' then
    u := new.user_id; strict_role := false; msg := 'become a Ghost';
  elsif tg_table_name = 'spy_assets' then
    u := new.asset_user_id; strict_role := false; msg := 'become a spy';
  elsif tg_table_name = 'mercenaries' then
    u := new.user_id; strict_role := false; msg := 'become a mercenary';
  elsif tg_table_name = 'mercenary_contracts' then
    if new.status::text <> 'accepted' then return new; end if;
    select user_id into u from public.mercenaries where id = new.mercenary_id;
    strict_role := new.role::text = 'headcount_filler'; msg := 'take this contract';
  else return new;
  end if;
  if public.edu_gate_passes(u) then return new; end if;
  if not strict_role and public.bar_sponsored(u) then return new; end if;
  raise exception 'EDU_REQUIRED: verify your @olemiss.edu email to %', msg;
end $$;

do $$
declare t text;
begin
  foreach t in array array['org_memberships', 'hessian_members', 'turf_checkins', 'ghost_profiles', 'spy_assets', 'mercenaries', 'mercenary_contracts'] loop
    execute format('drop trigger if exists edu_gate on public.%I', t);
    execute format('create trigger edu_gate before insert or update on public.%I for each row execute function public.tg_edu_gate()', t);
  end loop;
end $$;

revoke all on function public.edu_email_ok(uuid), public.edu_gate_passes(uuid), public.create_staff_invite(uuid, uuid, text, text),
  public.claim_staff_invite(uuid, text), public.revoke_staff_invite(uuid, uuid), public.bar_sponsored(uuid) from public, anon, authenticated;
grant execute on function public.edu_email_ok(uuid), public.edu_gate_passes(uuid), public.create_staff_invite(uuid, uuid, text, text),
  public.claim_staff_invite(uuid, text), public.revoke_staff_invite(uuid, uuid), public.bar_sponsored(uuid) to service_role;
