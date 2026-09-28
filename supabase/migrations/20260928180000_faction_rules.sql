-- BarWars: faction rules, leave flows and captain succession (Testing To-Do items 9 and 10).
-- Decisions: Brian, Sep 26 (rules, cooldowns, grace, notice, ex-captain lock) and Sep 28
-- (a deleted captain's unit passes to its longest-serving member, same as the notice period).
--
--   * Greek members can't be Hessians or solo mercenaries; Hessians can be solo mercenaries
--   * Cooldowns after leaving: Greek org 7d (before a company or Regiment), Hessian company 7d
--     (before any faction), Regiment 3d, mercenary 7d (before registering again),
--     spy 14d (before another handler can recruit you)
--   * Nobody leaves while their faction is in a live Turf War
--   * 72-hour grace: leave with no cooldown, notice or lock if the faction hasn't fought with you in it
--   * Captains step down with 3 days' notice (no new contracts or ambushes meanwhile); the unit's
--     nominee takes over when they accept, else the longest-serving member; nobody left = disband
--   * Ex-captain: 30 days before starting a new company or Regiment, and their old unit's members
--     can't join any faction the ex-captain is in for 30 days
--   * Staff can move a player between factions, bypassing all of this, with a note

-- ── Players no longer write faction tables directly (every route uses the server) ──────
drop policy if exists "auth insert greek_orgs" on public.greek_orgs;
drop policy if exists "org_admin update greek_orgs" on public.greek_orgs;
drop policy if exists "self insert membership" on public.org_memberships;
drop policy if exists "org_admin update members" on public.org_memberships;
drop policy if exists "auth insert hessian_companies" on public.hessian_companies;
drop policy if exists "captain update hessian_companies" on public.hessian_companies;
drop policy if exists "self insert hessian_members" on public.hessian_members;
drop policy if exists "captain update hessian_members" on public.hessian_members;
drop policy if exists "captain insert regiment" on public.regiments;
drop policy if exists "captain update regiment" on public.regiments;
drop policy if exists "captain insert regiment_members" on public.regiment_members;
drop policy if exists "captain update regiment_members" on public.regiment_members;
drop policy if exists "insert own mercenary" on public.mercenaries;
drop policy if exists "update own mercenary" on public.mercenaries;

-- ── Records ─────────────────────────────────────────────────────────────────
create table if not exists public.faction_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  faction_type text not null check (faction_type in ('greek', 'company', 'regiment', 'mercenary', 'spy')),
  faction_id uuid,
  joined_at timestamptz,
  left_at timestamptz not null default now(),
  reason text not null check (reason in ('left', 'removed', 'stepped_down', 'disbanded', 'staff_move', 'deregistered', 'quit')),
  was_captain boolean not null default false,
  grace boolean not null default false,
  note text,
  moved_by uuid references auth.users(id) on delete set null
);
create index if not exists faction_history_user on public.faction_history (user_id, left_at desc);
create index if not exists faction_history_faction on public.faction_history (faction_id);
alter table public.faction_history enable row level security;
create policy "read own faction history" on public.faction_history for select to authenticated using (user_id = auth.uid());

create table if not exists public.captain_stepdowns (
  id uuid primary key default gen_random_uuid(),
  faction_type text not null check (faction_type in ('company', 'regiment')),
  faction_id uuid not null,
  captain_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  nominee_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  new_captain_id uuid references auth.users(id) on delete set null
);
create unique index if not exists captain_stepdowns_one_pending on public.captain_stepdowns (faction_type, faction_id) where status = 'pending';
alter table public.captain_stepdowns enable row level security;

alter table public.spy_assets add column if not exists quit_at timestamptz;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.faction_rules_bypassed() returns boolean language sql stable as $$
  select coalesce(current_setting('barwars.bypass_faction_rules', true), '') = 'on'
$$;

create or replace function public.is_unit_member(p_type text, p_id uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case p_type
    when 'company' then exists (select 1 from public.hessian_members where company_id = p_id and user_id = p_user and verified)
                     or exists (select 1 from public.hessian_companies where id = p_id and captain_id = p_user)
    when 'regiment' then exists (select 1 from public.regiment_members where regiment_id = p_id and user_id = p_user)
                      or exists (select 1 from public.regiments where id = p_id and captain_id = p_user)
    else false end
$$;
create policy "unit reads its stepdown" on public.captain_stepdowns for select to authenticated
  using (public.is_unit_member(faction_type, faction_id));

-- A cooldown still running: the most recent non-grace departure of this kind within the window
create or replace function public.cooldown_until(p_user uuid, p_type text, p_days int)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(left_at) + make_interval(days => p_days) from public.faction_history
   where user_id = p_user and faction_type = p_type and not grace
     and reason in ('left', 'stepped_down', 'deregistered', 'quit', 'removed')
     and left_at > now() - make_interval(days => p_days)
$$;

-- Has this faction fought, contracted or ambushed since the player joined? (ends the 72-hour grace)
create or replace function public.faction_engaged_since(p_type text, p_id uuid, p_since timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_type
    when 'greek' then exists (select 1 from public.turf_claims
                               where (attacking_org_id = p_id or defending_org_id = p_id)
                                 and status in ('live', 'successful', 'failed', 'contested')
                                 and coalesce(window_open_at, created_at) >= p_since)
    when 'company' then exists (select 1 from public.hessian_contracts
                                 where company_id = p_id and status in ('accepted', 'completed', 'betrayed') and created_at >= p_since)
                     or exists (select 1 from public.hessian_ambushes where company_id = p_id and created_at >= p_since)
    when 'mercenary' then exists (select 1 from public.mercenary_contracts k join public.mercenaries m on m.id = k.mercenary_id
                                   where m.id = p_id and k.status in ('accepted', 'completed', 'failed') and k.created_at >= p_since)
    else false end
$$;

-- Is the faction in a live Turf War right now? (nobody leaves until it resolves)
create or replace function public.faction_in_live_war(p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_type
    when 'greek' then exists (select 1 from public.turf_claims where status = 'live' and (attacking_org_id = p_id or defending_org_id = p_id))
    when 'company' then exists (select 1 from public.hessian_contracts h join public.turf_claims c on c.id = h.claim_id
                                 where h.company_id = p_id and h.status = 'accepted' and c.status = 'live')
                     or exists (select 1 from public.hessian_ambushes where company_id = p_id and status = 'live')
    when 'mercenary' then exists (select 1 from public.mercenary_contracts k join public.turf_claims c on c.id = k.claim_id
                                   where k.mercenary_id = p_id and k.status = 'accepted' and c.status = 'live')
    else false end
$$;

-- The 30-day ex-captain lock: returns a message if p_user may not join the faction the ex-captain p_member is in
create or replace function public.ex_captain_blocks(p_joiner uuid, p_faction_type text, p_faction_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with faction_people as (
    select user_id from public.org_memberships where p_faction_type = 'greek' and org_id = p_faction_id and verified
    union select user_id from public.hessian_members where p_faction_type = 'company' and company_id = p_faction_id and verified
    union select captain_id from public.hessian_companies where p_faction_type = 'company' and id = p_faction_id
    union select user_id from public.regiment_members where p_faction_type = 'regiment' and regiment_id = p_faction_id
    union select captain_id from public.regiments where p_faction_type = 'regiment' and id = p_faction_id
  ), ex_captains as (
    select h.faction_type, h.faction_id from public.faction_history h join faction_people f on f.user_id = h.user_id
     where h.was_captain and not h.grace and h.reason in ('stepped_down', 'left')
       and h.left_at > now() - interval '30 days' and h.user_id <> p_joiner
  )
  select exists (
    select 1 from ex_captains x
     where exists (select 1 from public.hessian_members m where x.faction_type = 'company' and m.company_id = x.faction_id and m.user_id = p_joiner)
        or exists (select 1 from public.regiment_members m where x.faction_type = 'regiment' and m.regiment_id = x.faction_id and m.user_id = p_joiner)
        or exists (select 1 from public.faction_history h2 where h2.user_id = p_joiner and h2.faction_id = x.faction_id
                    and h2.left_at > now() - interval '30 days'))
$$;

-- Why can't this player join? null = they can. p_target: greek | company | regiment | mercenary | new_company | new_regiment
create or replace function public.faction_join_block(p_user uuid, p_target text, p_target_id uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare t timestamptz;
begin
  if public.faction_rules_bypassed() then return null; end if;

  if p_target = 'greek' then
    if exists (select 1 from public.hessian_members where user_id = p_user) or exists (select 1 from public.hessian_companies where captain_id = p_user) then
      return 'Hessians can''t join a Greek org. Leave your company first.'; end if;
    if exists (select 1 from public.mercenaries where user_id = p_user and is_active) then
      return 'Solo mercenaries can''t join a Greek org. Deregister as a mercenary first.'; end if;
    t := greatest(public.cooldown_until(p_user, 'company', 7), public.cooldown_until(p_user, 'regiment', 3));
    if t is not null then return 'COOLDOWN:' || t; end if;

  elsif p_target in ('company', 'new_company') then
    if exists (select 1 from public.org_memberships where user_id = p_user) then
      return 'Greek members can''t be Hessians. Leave your Greek org (or cancel your request) first.'; end if;
    if exists (select 1 from public.hessian_members where user_id = p_user and (p_target_id is null or company_id <> p_target_id))
       or exists (select 1 from public.hessian_companies where captain_id = p_user and (p_target_id is null or id <> p_target_id)) then
      return 'You''re already in a Hessian company (or have a pending request). Leave or cancel it first.'; end if;
    t := greatest(public.cooldown_until(p_user, 'greek', 7), public.cooldown_until(p_user, 'company', 7), public.cooldown_until(p_user, 'regiment', 3));
    if t is not null then return 'COOLDOWN:' || t; end if;

  elsif p_target in ('regiment', 'new_regiment') then
    if exists (select 1 from public.regiment_members where user_id = p_user and (p_target_id is null or regiment_id <> p_target_id))
       or exists (select 1 from public.regiments where captain_id = p_user and (p_target_id is null or id <> p_target_id)) then
      return 'You''re already in a Regiment. Leave it first.'; end if;
    t := greatest(public.cooldown_until(p_user, 'greek', 7), public.cooldown_until(p_user, 'company', 7), public.cooldown_until(p_user, 'regiment', 3));
    if t is not null then return 'COOLDOWN:' || t; end if;

  elsif p_target = 'mercenary' then
    if exists (select 1 from public.org_memberships where user_id = p_user) then
      return 'Greek members can''t be solo mercenaries. Becoming a mole is how a Greek member betrays their org.'; end if;
    t := public.cooldown_until(p_user, 'mercenary', 7);
    if t is not null then return 'COOLDOWN:' || t; end if;
  end if;

  -- Starting a new unit: the 30-day ex-captain lock
  if p_target in ('new_company', 'new_regiment') then
    select max(left_at) + interval '30 days' into t from public.faction_history
     where user_id = p_user and was_captain and not grace and reason in ('stepped_down', 'left') and left_at > now() - interval '30 days';
    if t is not null then return 'EXCAPTAIN:' || t; end if;
  end if;

  -- Joining an existing unit whose member is your old unit's ex-captain
  if p_target in ('greek', 'company', 'regiment') and p_target_id is not null
     and public.ex_captain_blocks(p_user, p_target, p_target_id) then
    return 'FOLLOW:Your former captain is in this faction. Members can''t follow a departing captain for 30 days.';
  end if;
  return null;
end $$;

-- ── Enforcement on every write, whatever path it takes ─────────────────────
create or replace function public.tg_faction_join_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare msg text; tgt text; tid uuid; who uuid;
begin
  if tg_table_name = 'org_memberships' then
    if tg_op = 'UPDATE' and not (new.verified and not old.verified) then return new; end if;
    tgt := 'greek'; tid := new.org_id; who := new.user_id;
  elsif tg_table_name = 'hessian_members' then
    if exists (select 1 from public.hessian_companies where id = new.company_id and captain_id = new.user_id) then return new; end if;
    tgt := 'company'; tid := new.company_id; who := new.user_id;
  elsif tg_table_name = 'regiment_members' then
    if exists (select 1 from public.regiments where id = new.regiment_id and captain_id = new.user_id) then return new; end if;
    tgt := 'regiment'; tid := new.regiment_id; who := new.user_id;
  elsif tg_table_name = 'mercenaries' then
    if tg_op = 'UPDATE' and not (new.is_active and not old.is_active) then return new; end if;
    tgt := 'mercenary'; tid := new.id; who := new.user_id;
  elsif tg_table_name = 'hessian_companies' then
    tgt := 'new_company'; tid := new.id; who := new.captain_id;
  elsif tg_table_name = 'regiments' then
    tgt := 'new_regiment'; tid := new.id; who := new.captain_id;
  end if;
  msg := public.faction_join_block(who, tgt, tid);
  if msg is not null then raise exception '%', msg using errcode = 'check_violation', hint = 'FACTION_RULE'; end if;
  return new;
end $$;

drop trigger if exists faction_rules on public.org_memberships;
create trigger faction_rules before insert or update of verified on public.org_memberships for each row execute function public.tg_faction_join_rules();
drop trigger if exists faction_rules on public.hessian_members;
create trigger faction_rules before insert on public.hessian_members for each row execute function public.tg_faction_join_rules();
drop trigger if exists faction_rules on public.regiment_members;
create trigger faction_rules before insert on public.regiment_members for each row execute function public.tg_faction_join_rules();
drop trigger if exists faction_rules on public.mercenaries;
create trigger faction_rules before insert or update of is_active on public.mercenaries for each row execute function public.tg_faction_join_rules();
drop trigger if exists faction_rules on public.hessian_companies;
create trigger faction_rules before insert on public.hessian_companies for each row execute function public.tg_faction_join_rules();
drop trigger if exists faction_rules on public.regiments;
create trigger faction_rules before insert on public.regiments for each row execute function public.tg_faction_join_rules();

-- ── Unit bookkeeping ────────────────────────────────────────────────────────
create or replace function public.recount_unit(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'company' then
    update public.hessian_companies set member_count = (select count(*) from public.hessian_members where company_id = p_id and verified) where id = p_id;
  elsif p_type = 'regiment' then
    update public.regiments set member_count = (select count(*) from public.regiment_members where regiment_id = p_id) where id = p_id;
  elsif p_type = 'greek' then
    update public.greek_orgs set verified_member_count = (select count(*) from public.org_memberships where org_id = p_id and verified) where id = p_id;
  end if;
end $$;

-- Hand a unit to its next captain (the nominee, else the longest-serving member) or disband it.
-- The departing captain leaves the unit. Returns the new captain, or null if the unit disbanded.
create or replace function public.hand_off_unit(p_type text, p_id uuid, p_successor uuid, p_old_captain uuid, p_grace boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nxt uuid; joined timestamptz;
begin
  if p_type = 'company' then
    select joined_at into joined from public.hessian_members where company_id = p_id and user_id = p_old_captain;
    nxt := coalesce(
      (select user_id from public.hessian_members where company_id = p_id and user_id = p_successor and verified and user_id is distinct from p_old_captain),
      (select user_id from public.hessian_members where company_id = p_id and verified and user_id is distinct from p_old_captain
        order by joined_at asc limit 1));
  else
    select joined_at into joined from public.regiment_members where regiment_id = p_id and user_id = p_old_captain;
    nxt := coalesce(
      (select user_id from public.regiment_members where regiment_id = p_id and user_id = p_successor and user_id is distinct from p_old_captain),
      (select user_id from public.regiment_members where regiment_id = p_id and user_id is distinct from p_old_captain
        order by joined_at asc limit 1));
  end if;

  if p_old_captain is not null and exists (select 1 from auth.users where id = p_old_captain) then
    insert into public.faction_history (user_id, faction_type, faction_id, joined_at, reason, was_captain, grace)
    values (p_old_captain, p_type, p_id, joined, case when nxt is null then 'disbanded' else p_reason end, true, p_grace);
  end if;
  update public.captain_stepdowns set status = 'completed', completed_at = now(), new_captain_id = nxt
   where faction_type = p_type and faction_id = p_id and status = 'pending';

  if nxt is null then
    if p_type = 'company' then delete from public.hessian_companies where id = p_id;
    else delete from public.regiments where id = p_id; end if;
    return null;
  end if;

  if p_type = 'company' then
    update public.hessian_companies set captain_id = nxt where id = p_id;
    update public.hessian_members set role = 'captain' where company_id = p_id and user_id = nxt;
    delete from public.hessian_members where company_id = p_id and user_id = p_old_captain;
  else
    update public.regiments set captain_id = nxt where id = p_id;
    update public.regiment_members set role = 'captain' where regiment_id = p_id and user_id = nxt;
    delete from public.regiment_members where regiment_id = p_id and user_id = p_old_captain;
  end if;
  perform public.recount_unit(p_type, p_id);
  return nxt;
end $$;

-- A captain whose account is deleted: the unit passes on (decided by Brian, Sep 28)
alter table public.hessian_companies alter column captain_id drop not null;
alter table public.regiments alter column captain_id drop not null;
alter table public.hessian_companies drop constraint if exists hessian_companies_captain_id_fkey;
alter table public.hessian_companies add constraint hessian_companies_captain_id_fkey
  foreign key (captain_id) references auth.users(id) on delete set null;
alter table public.regiments drop constraint if exists regiments_captain_id_fkey;
alter table public.regiments add constraint regiments_captain_id_fkey
  foreign key (captain_id) references auth.users(id) on delete set null;

create or replace function public.tg_captain_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.captain_id is null and old.captain_id is not null then
    perform public.hand_off_unit(case tg_table_name when 'hessian_companies' then 'company' else 'regiment' end,
                                 new.id, null, old.captain_id, false, 'left');
  end if;
  return null;
end $$;
drop trigger if exists captain_gone on public.hessian_companies;
create trigger captain_gone after update of captain_id on public.hessian_companies for each row execute function public.tg_captain_gone();
drop trigger if exists captain_gone on public.regiments;
create trigger captain_gone after update of captain_id on public.regiments for each row execute function public.tg_captain_gone();

-- ── Leaving ─────────────────────────────────────────────────────────────────
-- p_type: greek | company | regiment | mercenary | spy. p_actor: who did it (the player, or a captain removing them).
-- Returns jsonb { status: 'left' | 'cancelled', grace, cooldown_until }
create or replace function public.leave_faction(p_user uuid, p_type text, p_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare joined timestamptz; pending boolean := false; is_grace boolean; days int; reason text; removing boolean;
begin
  removing := p_actor is not null and p_actor <> p_user;
  reason := case when removing then 'removed' when p_type = 'mercenary' then 'deregistered' when p_type = 'spy' then 'quit' else 'left' end;

  if p_type = 'greek' then
    select created_at, not verified into joined, pending from public.org_memberships where org_id = p_id and user_id = p_user;
    if joined is null then raise exception 'NOT_A_MEMBER'; end if;
    if not pending and exists (select 1 from public.org_memberships where org_id = p_id and user_id = p_user and role = 'admin')
       and not exists (select 1 from public.org_memberships where org_id = p_id and verified and role = 'admin' and user_id <> p_user)
       and exists (select 1 from public.org_memberships where org_id = p_id and verified and user_id <> p_user) then
      raise exception 'LAST_ADMIN';
    end if;
  elsif p_type = 'company' then
    if exists (select 1 from public.hessian_companies where id = p_id and captain_id = p_user) then raise exception 'CAPTAIN_MUST_STEP_DOWN'; end if;
    select joined_at, not verified into joined, pending from public.hessian_members where company_id = p_id and user_id = p_user;
    if joined is null then raise exception 'NOT_A_MEMBER'; end if;
  elsif p_type = 'regiment' then
    if exists (select 1 from public.regiments where id = p_id and captain_id = p_user) then raise exception 'CAPTAIN_MUST_STEP_DOWN'; end if;
    select joined_at into joined from public.regiment_members where regiment_id = p_id and user_id = p_user;
    if joined is null then raise exception 'NOT_A_MEMBER'; end if;
  elsif p_type = 'mercenary' then
    select created_at, id into joined, p_id from public.mercenaries where user_id = p_user and is_active;
    if joined is null then raise exception 'NOT_A_MEMBER'; end if;
  elsif p_type = 'spy' then
    select min(created_at) into joined from public.spy_assets where asset_user_id = p_user and is_active;
    if joined is null then raise exception 'NOT_A_MEMBER'; end if;
  else
    raise exception 'INVALID_FACTION';
  end if;

  -- A pending request just gets cancelled: no cooldown
  if pending then
    if p_type = 'greek' then delete from public.org_memberships where org_id = p_id and user_id = p_user;
    else delete from public.hessian_members where company_id = p_id and user_id = p_user; end if;
    return jsonb_build_object('status', 'cancelled', 'grace', true, 'cooldown_until', null);
  end if;

  if not removing and p_type <> 'spy' and public.faction_in_live_war(p_type, p_id) then raise exception 'IN_LIVE_WAR'; end if;

  is_grace := removing or (joined > now() - interval '72 hours' and not public.faction_engaged_since(p_type, p_id, joined));

  if p_type = 'greek' then delete from public.org_memberships where org_id = p_id and user_id = p_user;
  elsif p_type = 'company' then delete from public.hessian_members where company_id = p_id and user_id = p_user;
  elsif p_type = 'regiment' then delete from public.regiment_members where regiment_id = p_id and user_id = p_user;
  elsif p_type = 'mercenary' then
    update public.mercenaries set is_active = false where id = p_id;
    -- Leaving mid-contract forfeits the player's share (decided Sep 26)
    update public.mercenary_contracts set status = 'failed', resolved_at = now() where mercenary_id = p_id and status in ('pending', 'accepted');
  elsif p_type = 'spy' then
    update public.spy_assets set is_active = false, quit_at = now() where asset_user_id = p_user and is_active;
  end if;
  perform public.recount_unit(p_type, p_id);

  insert into public.faction_history (user_id, faction_type, faction_id, joined_at, reason, grace, moved_by)
  values (p_user, p_type, p_id, joined, reason, is_grace, case when removing then p_actor end);

  days := case p_type when 'greek' then 7 when 'company' then 7 when 'regiment' then 3 when 'mercenary' then 7 when 'spy' then 14 end;
  return jsonb_build_object('status', 'left', 'grace', is_grace,
                            'cooldown_until', case when is_grace then null else now() + make_interval(days => days) end);
end $$;

-- ── Captain stepping down ───────────────────────────────────────────────────
-- Within the 72-hour grace (and before the unit has fought), the captain leaves at once.
-- Otherwise a 3-day notice starts; the unit's nominee can accept earlier.
create or replace function public.start_stepdown(p_user uuid, p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare created timestamptz; s record; nxt uuid;
begin
  if p_type = 'company' then
    select created_at into created from public.hessian_companies where id = p_id and captain_id = p_user;
  elsif p_type = 'regiment' then
    select created_at into created from public.regiments where id = p_id and captain_id = p_user;
  else raise exception 'INVALID_FACTION'; end if;
  if created is null then raise exception 'NOT_CAPTAIN'; end if;
  if public.faction_in_live_war(p_type, p_id) then raise exception 'IN_LIVE_WAR'; end if;

  if created > now() - interval '72 hours' and not public.faction_engaged_since(p_type, p_id, created) then
    nxt := public.hand_off_unit(p_type, p_id, null, p_user, true, 'stepped_down');
    return jsonb_build_object('status', case when nxt is null then 'disbanded' else 'handed_off' end, 'grace', true, 'new_captain_id', nxt);
  end if;

  select * into s from public.captain_stepdowns where faction_type = p_type and faction_id = p_id and status = 'pending';
  if found then return jsonb_build_object('status', 'notice', 'ends_at', s.ends_at, 'grace', false); end if;
  insert into public.captain_stepdowns (faction_type, faction_id, captain_id, ends_at)
  values (p_type, p_id, p_user, now() + interval '3 days') returning * into s;
  return jsonb_build_object('status', 'notice', 'ends_at', s.ends_at, 'grace', false);
end $$;

create or replace function public.nominate_successor(p_user uuid, p_type text, p_id uuid, p_nominee uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_unit_member(p_type, p_id, p_nominee) or p_nominee = p_user then raise exception 'NOT_A_MEMBER'; end if;
  update public.captain_stepdowns set nominee_id = p_nominee
   where faction_type = p_type and faction_id = p_id and status = 'pending' and captain_id = p_user;
  if not found then raise exception 'NO_STEPDOWN'; end if;
end $$;

create or replace function public.accept_captaincy(p_user uuid, p_type text, p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.captain_stepdowns where faction_type = p_type and faction_id = p_id and status = 'pending' and nominee_id = p_user;
  if not found then raise exception 'NOT_NOMINATED'; end if;
  return public.hand_off_unit(p_type, p_id, p_user, s.captain_id, false, 'stepped_down');
end $$;

create or replace function public.cancel_stepdown(p_user uuid, p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.captain_stepdowns set status = 'cancelled', completed_at = now()
   where faction_type = p_type and faction_id = p_id and status = 'pending' and captain_id = p_user;
  if not found then raise exception 'NO_STEPDOWN'; end if;
end $$;

-- Notice over: hand off to the nominee (if they're still in the unit) or the longest-serving member
create or replace function public.finalize_due_stepdowns() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select * from public.captain_stepdowns where status = 'pending' and ends_at <= now() for update skip locked loop
    if public.faction_in_live_war(s.faction_type, s.faction_id) then continue; end if;  -- wait for the war to resolve
    perform public.hand_off_unit(s.faction_type, s.faction_id, s.nominee_id, s.captain_id, false, 'stepped_down');
    n := n + 1;
  end loop;
  return n;
end $$;

-- During the notice the captain can't start new contracts or ambushes
create or replace function public.captain_on_notice(p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.captain_stepdowns where faction_type = p_type and faction_id = p_id and status = 'pending')
$$;

-- ── Spies: rival sides only, and a 14-day cooldown after quitting ───────────
create or replace function public.recruit_block(p_recruiter_org uuid, p_recruiter_company uuid, p_target uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t timestamptz;
begin
  if p_recruiter_org is not null and exists (select 1 from public.org_memberships where org_id = p_recruiter_org and user_id = p_target) then
    return 'You can''t recruit a member of your own org.'; end if;
  if p_recruiter_company is not null and (exists (select 1 from public.hessian_members where company_id = p_recruiter_company and user_id = p_target)
       or exists (select 1 from public.hessian_companies where id = p_recruiter_company and captain_id = p_target)) then
    return 'You can''t recruit a member of your own company.'; end if;
  if not exists (select 1 from public.org_memberships where user_id = p_target and verified)
     and not exists (select 1 from public.hessian_members where user_id = p_target and verified)
     and not exists (select 1 from public.hessian_companies where captain_id = p_target) then
    return 'A mole has to belong to a rival Greek org or Hessian company.'; end if;
  select max(quit_at) + interval '14 days' into t from public.spy_assets where asset_user_id = p_target and quit_at > now() - interval '14 days';
  if t is not null then return 'This player can''t be recruited again yet.'; end if;
  return null;
end $$;

-- ── Staff: move a player between factions, bypassing cooldowns, with a note ───
create or replace function public.staff_move_player(p_staff uuid, p_user uuid, p_to_type text, p_to_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; cap_company uuid; cap_regiment uuid;
begin
  if not exists (select 1 from public.profiles where id = p_staff and is_staff) then raise exception 'NOT_STAFF'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
  if p_to_type not in ('greek', 'company', 'regiment', 'none') then raise exception 'INVALID_FACTION'; end if;
  perform set_config('barwars.bypass_faction_rules', 'on', true);

  -- A captain moved out hands the unit to the longest-serving member
  select id into cap_company from public.hessian_companies where captain_id = p_user;
  if cap_company is not null and p_to_type in ('company', 'greek', 'none') and (p_to_type <> 'company' or p_to_id <> cap_company) then
    perform public.hand_off_unit('company', cap_company, null, p_user, true, 'stepped_down');
    update public.faction_history set reason = 'staff_move', note = p_note, moved_by = p_staff
     where id = (select id from public.faction_history where user_id = p_user order by left_at desc limit 1);
  end if;
  select id into cap_regiment from public.regiments where captain_id = p_user;
  if cap_regiment is not null and p_to_type in ('regiment', 'none') and (p_to_type <> 'regiment' or p_to_id <> cap_regiment) then
    perform public.hand_off_unit('regiment', cap_regiment, null, p_user, true, 'stepped_down');
    update public.faction_history set reason = 'staff_move', note = p_note, moved_by = p_staff
     where id = (select id from public.faction_history where user_id = p_user order by left_at desc limit 1);
  end if;

  -- Leave whatever conflicts with the destination (grace = no cooldown for a staff move)
  -- Greek and Hessian exclude each other; one of each kind; Regiments sit alongside either
  for r in select 'greek' t, org_id id, created_at j from public.org_memberships
            where user_id = p_user and p_to_type in ('greek', 'company', 'none') and (p_to_type <> 'greek' or org_id <> p_to_id)
           union all select 'company', company_id, joined_at from public.hessian_members
            where user_id = p_user and p_to_type in ('company', 'greek', 'none') and (p_to_type <> 'company' or company_id <> p_to_id)
           union all select 'regiment', regiment_id, joined_at from public.regiment_members
            where user_id = p_user and p_to_type in ('regiment', 'none') and (p_to_type <> 'regiment' or regiment_id <> p_to_id) loop
    if r.t = 'greek' then delete from public.org_memberships where user_id = p_user and org_id = r.id;
    elsif r.t = 'company' then delete from public.hessian_members where user_id = p_user and company_id = r.id;
    else delete from public.regiment_members where user_id = p_user and regiment_id = r.id; end if;
    perform public.recount_unit(r.t, r.id);
    insert into public.faction_history (user_id, faction_type, faction_id, joined_at, reason, grace, note, moved_by)
    values (p_user, r.t, r.id, r.j, 'staff_move', true, p_note, p_staff);
  end loop;
  if p_to_type = 'greek' then
    update public.mercenaries set is_active = false where user_id = p_user and is_active;
    insert into public.org_memberships (org_id, user_id, role, verified, verified_by, verified_at)
    values (p_to_id, p_user, 'member', true, p_staff, now())
    on conflict (org_id, user_id) do update set verified = true, verified_by = p_staff, verified_at = now();
  elsif p_to_type = 'company' then
    insert into public.hessian_members (company_id, user_id, role, verified) values (p_to_id, p_user, 'member', true)
    on conflict (company_id, user_id) do update set verified = true;
  elsif p_to_type = 'regiment' then
    insert into public.regiment_members (regiment_id, user_id, role) values (p_to_id, p_user, 'member')
    on conflict (regiment_id, user_id) do nothing;
  end if;
  if p_to_type <> 'none' then perform public.recount_unit(p_to_type, p_to_id); end if;
  return jsonb_build_object('status', 'moved');
end $$;

-- ── Nothing here is callable by players; the routes call these with the service role ──
do $r$
declare f text;
begin
  foreach f in array array[
    'faction_rules_bypassed()', 'cooldown_until(uuid,text,integer)', 'faction_engaged_since(text,uuid,timestamptz)',
    'faction_in_live_war(text,uuid)', 'ex_captain_blocks(uuid,text,uuid)', 'faction_join_block(uuid,text,uuid)',
    'tg_faction_join_rules()', 'recount_unit(text,uuid)', 'hand_off_unit(text,uuid,uuid,uuid,boolean,text)', 'tg_captain_gone()',
    'leave_faction(uuid,text,uuid,uuid)', 'start_stepdown(uuid,text,uuid)', 'nominate_successor(uuid,text,uuid,uuid)',
    'accept_captaincy(uuid,text,uuid)', 'cancel_stepdown(uuid,text,uuid)', 'finalize_due_stepdowns()',
    'captain_on_notice(text,uuid)', 'recruit_block(uuid,uuid,uuid)', 'staff_move_player(uuid,uuid,text,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $r$;
revoke all on function public.is_unit_member(text, uuid, uuid) from public, anon;
grant execute on function public.is_unit_member(text, uuid, uuid) to authenticated, service_role;

-- Notices that ran out get handed off every 15 minutes
select cron.schedule('finalize-captain-stepdowns', '*/15 * * * *', $job$ select public.finalize_due_stepdowns(); $job$);
