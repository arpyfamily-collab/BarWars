-- BarWars: War Comms Phase 1, "chats that work" (To-Do item 18). Decided by Brian, Sep 28, 2026:
--   * Only the server creates channels and manages membership; messages come from the real sender
--   * Team chats: every Greek org (verified members only), Hessian company and Regiment
--   * Live Turf War: each side's war chat (hired Hessians and mercenaries added for the war,
--     removed after) and a shared Battlefield; afterwards the Battlefield is a read-only record
--   * Players outside the war can read a Battlefield but not post
--   * Direct messages are off for the pilot

-- ── Structure ───────────────────────────────────────────────────────────────
alter table public.channels add column if not exists regiment_id uuid references public.regiments(id) on delete cascade;
alter table public.channels add column if not exists claim_id uuid references public.turf_claims(id) on delete cascade;
alter table public.channels add column if not exists side text check (side in ('attacker', 'defender'));
alter table public.channels add column if not exists ended_at timestamptz;

create unique index if not exists channels_team_org on public.channels (org_id) where channel_type = 'war_room';
create unique index if not exists channels_team_company on public.channels (hessian_company_id) where channel_type = 'hessian';
create unique index if not exists channels_team_regiment on public.channels (regiment_id) where channel_type = 'regiment';
create unique index if not exists channels_war_side on public.channels (claim_id, side) where channel_type = 'war_side';
create unique index if not exists channels_battlefield_claim on public.channels (claim_id) where channel_type = 'battlefield';

-- ── Membership helpers (server side only) ───────────────────────────────────
create or replace function public.chat_add(p_channel uuid, p_user uuid, p_role text default 'member')
returns void language sql security definer set search_path = public as $$
  insert into public.channel_members (channel_id, user_id, role)
  select p_channel, p_user, p_role where p_channel is not null and p_user is not null
  on conflict (channel_id, user_id) do nothing
$$;

create or replace function public.chat_remove(p_channel uuid, p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.channel_members where channel_id = p_channel and user_id = p_user
$$;

-- The side of a live war this org is fighting on, if any
create or replace function public.org_war_side(p_claim uuid, p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when c.attacking_org_id = p_org then 'attacker'
              when c.defending_org_id = p_org then 'defender' end
    from public.turf_claims c where c.id = p_claim
$$;

-- Add a player to a live war as a fighter (their org's side) or as a hired hand
create or replace function public.war_add(p_claim uuid, p_side text, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.chat_add((select id from public.channels
                            where channel_type = 'war_side' and claim_id = p_claim and side = p_side and is_active),
                          p_user, p_role);
  perform public.chat_add((select id from public.channels
                            where channel_type = 'battlefield' and claim_id = p_claim and is_active),
                          p_user, p_role);
end $$;

create or replace function public.war_remove(p_claim uuid, p_user uuid, p_battlefield boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.channel_members m using public.channels c
   where m.channel_id = c.id and m.user_id = p_user and c.claim_id = p_claim and c.is_active
     and (c.channel_type = 'war_side' or (p_battlefield and c.channel_type = 'battlefield'));
end $$;

-- ── Team chats ──────────────────────────────────────────────────────────────
create or replace function public.tg_greek_org_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.channels (channel_type, name, org_id)
  values ('war_room', new.name || ' War Room', new.id)
  on conflict do nothing;
  return new;
end $$;

-- Verified members of an org are in its team chat, and in its live wars
create or replace function public.sync_org_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean; c record; team uuid;
begin
  select exists (select 1 from public.org_memberships where org_id = p_org and user_id = p_user and verified) into ok;
  select id into team from public.channels where channel_type = 'war_room' and org_id = p_org;
  if ok then perform public.chat_add(team, p_user, 'member'); else perform public.chat_remove(team, p_user); end if;
  for c in select id from public.turf_claims
            where status = 'live' and (attacking_org_id = p_org or defending_org_id = p_org) loop
    if ok then perform public.war_add(c.id, public.org_war_side(c.id, p_org), p_user, 'member');
    else perform public.war_remove(c.id, p_user, true); end if;
  end loop;
end $$;

create or replace function public.tg_org_membership_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.sync_org_member(old.org_id, old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.sync_org_member(new.org_id, new.user_id); end if;
  return null;
end $$;

-- Hessian company: captain plus members; and the company's hired wars
create or replace function public.sync_company_member(p_company uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean; team uuid; k record;
begin
  select exists (select 1 from public.hessian_members where company_id = p_company and user_id = p_user)
      or exists (select 1 from public.hessian_companies where id = p_company and captain_id = p_user) into ok;
  select id into team from public.channels where channel_type = 'hessian' and hessian_company_id = p_company;
  if ok then perform public.chat_add(team, p_user, 'member'); else perform public.chat_remove(team, p_user); end if;
  for k in select h.claim_id, h.side::text as side from public.hessian_contracts h
             join public.turf_claims c on c.id = h.claim_id
            where h.company_id = p_company and h.status = 'accepted' and c.status = 'live' loop
    if ok then perform public.war_add(k.claim_id, k.side, p_user, 'hired');
    else perform public.war_remove(k.claim_id, p_user, true); end if;
  end loop;
end $$;

create or replace function public.tg_hessian_company_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channels (channel_type, name, hessian_company_id)
    values ('hessian', new.name || ' Comms', new.id) on conflict do nothing;
  elsif old.captain_id is distinct from new.captain_id then
    perform public.sync_company_member(new.id, old.captain_id);
  end if;
  perform public.sync_company_member(new.id, new.captain_id);
  return null;
end $$;

create or replace function public.tg_hessian_member_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.sync_company_member(old.company_id, old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.sync_company_member(new.company_id, new.user_id); end if;
  return null;
end $$;

-- Regiment: captain plus members
create or replace function public.sync_regiment_member(p_regiment uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean; team uuid;
begin
  select exists (select 1 from public.regiment_members where regiment_id = p_regiment and user_id = p_user)
      or exists (select 1 from public.regiments where id = p_regiment and captain_id = p_user) into ok;
  select id into team from public.channels where channel_type = 'regiment' and regiment_id = p_regiment;
  if ok then perform public.chat_add(team, p_user, 'member'); else perform public.chat_remove(team, p_user); end if;
end $$;

create or replace function public.tg_regiment_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channels (channel_type, name, regiment_id)
    values ('regiment', new.name || ' Regiment', new.id) on conflict do nothing;
  elsif old.captain_id is distinct from new.captain_id then
    perform public.sync_regiment_member(new.id, old.captain_id);
  end if;
  perform public.sync_regiment_member(new.id, new.captain_id);
  return null;
end $$;

create or replace function public.tg_regiment_member_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.sync_regiment_member(old.regiment_id, old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.sync_regiment_member(new.regiment_id, new.user_id); end if;
  return null;
end $$;

-- ── War chats ───────────────────────────────────────────────────────────────
create or replace function public.merc_side(p_contract public.mercenary_contracts)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    case when p_contract.hirer_org_id is not null then public.org_war_side(p_contract.claim_id, p_contract.hirer_org_id) end,
    (select h.side::text from public.hessian_contracts h
      where h.company_id = p_contract.hirer_company_id and h.claim_id = p_contract.claim_id and h.status = 'accepted'
      limit 1))
$$;

create or replace function public.open_war_chats(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; bar text; att text; def text; u record;
begin
  select * into c from public.turf_claims where id = p_claim;
  select name into bar from public.venues where id = c.bar_id;
  select name into att from public.greek_orgs where id = c.attacking_org_id;
  select name into def from public.greek_orgs where id = c.defending_org_id;

  insert into public.channels (channel_type, name, claim_id, venue_id, org_id)
  values ('battlefield', 'Battle at ' || coalesce(bar, 'the bar'), p_claim, c.bar_id, null)
  on conflict do nothing;
  insert into public.channels (channel_type, name, claim_id, side, org_id, venue_id)
  values ('war_side', coalesce(att, 'Attackers') || ' — War at ' || coalesce(bar, 'the bar'), p_claim, 'attacker', c.attacking_org_id, c.bar_id)
  on conflict do nothing;
  if c.defending_org_id is not null then
    insert into public.channels (channel_type, name, claim_id, side, org_id, venue_id)
    values ('war_side', coalesce(def, 'Defenders') || ' — Defending ' || coalesce(bar, 'the bar'), p_claim, 'defender', c.defending_org_id, c.bar_id)
    on conflict do nothing;
  end if;

  for u in select user_id, org_id from public.org_memberships
            where verified and org_id in (c.attacking_org_id, c.defending_org_id) loop
    perform public.war_add(p_claim, public.org_war_side(p_claim, u.org_id), u.user_id, 'member');
  end loop;
  -- Hired Hessian companies
  for u in select m.user_id, h.side::text as side from public.hessian_contracts h
             join public.hessian_members m on m.company_id = h.company_id
            where h.claim_id = p_claim and h.status = 'accepted'
           union
           select co.captain_id, h.side::text from public.hessian_contracts h
             join public.hessian_companies co on co.id = h.company_id
            where h.claim_id = p_claim and h.status = 'accepted' loop
    perform public.war_add(p_claim, u.side, u.user_id, 'hired');
  end loop;
  -- Hired mercenaries
  for u in select m.user_id, public.merc_side(k) as side from public.mercenary_contracts k
             join public.mercenaries m on m.id = k.mercenary_id
            where k.claim_id = p_claim and k.status = 'accepted' loop
    if u.side is not null then perform public.war_add(p_claim, u.side, u.user_id, 'hired'); end if;
  end loop;
end $$;

create or replace function public.close_war_chats(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Hired hands leave the side chats; everyone keeps the Battlefield record
  delete from public.channel_members m using public.channels c
   where m.channel_id = c.id and c.claim_id = p_claim and c.channel_type = 'war_side' and m.role = 'hired';
  update public.channels set is_active = false, ended_at = coalesce(ended_at, now())
   where claim_id = p_claim and is_active;
end $$;

create or replace function public.tg_turf_claim_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    perform public.open_war_chats(new.id);
  elsif new.status in ('successful', 'failed', 'cancelled') and tg_op = 'UPDATE'
        and old.status is distinct from new.status then
    perform public.close_war_chats(new.id);
  end if;
  return null;
end $$;

create or replace function public.tg_hessian_contract_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select user_id from public.hessian_members where company_id = new.company_id
           union select captain_id from public.hessian_companies where id = new.company_id loop
    if new.status = 'accepted' then perform public.war_add(new.claim_id, new.side::text, u, 'hired');
    elsif tg_op = 'UPDATE' and old.status = 'accepted' then perform public.war_remove(new.claim_id, u, false);
    end if;
  end loop;
  return null;
end $$;

create or replace function public.tg_mercenary_contract_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; s text;
begin
  select user_id into u from public.mercenaries where id = new.mercenary_id;
  if new.status = 'accepted' then
    s := public.merc_side(new);
    if s is not null then perform public.war_add(new.claim_id, s, u, 'hired'); end if;
  elsif tg_op = 'UPDATE' and old.status = 'accepted' and new.status in ('failed', 'rejected') then
    perform public.war_remove(new.claim_id, u, false);
  end if;
  return null;
end $$;

drop trigger if exists greek_org_chat on public.greek_orgs;
create trigger greek_org_chat after insert on public.greek_orgs for each row execute function public.tg_greek_org_chat();
drop trigger if exists org_membership_chat on public.org_memberships;
create trigger org_membership_chat after insert or update of verified, org_id, user_id or delete on public.org_memberships
  for each row execute function public.tg_org_membership_chat();
drop trigger if exists hessian_company_chat on public.hessian_companies;
create trigger hessian_company_chat after insert or update of captain_id on public.hessian_companies
  for each row execute function public.tg_hessian_company_chat();
drop trigger if exists hessian_member_chat on public.hessian_members;
create trigger hessian_member_chat after insert or update of company_id, user_id or delete on public.hessian_members
  for each row execute function public.tg_hessian_member_chat();
drop trigger if exists regiment_chat on public.regiments;
create trigger regiment_chat after insert or update of captain_id on public.regiments
  for each row execute function public.tg_regiment_chat();
drop trigger if exists regiment_member_chat on public.regiment_members;
create trigger regiment_member_chat after insert or update of regiment_id, user_id or delete on public.regiment_members
  for each row execute function public.tg_regiment_member_chat();
drop trigger if exists turf_claim_chat on public.turf_claims;
create trigger turf_claim_chat after insert or update of status on public.turf_claims
  for each row execute function public.tg_turf_claim_chat();
drop trigger if exists hessian_contract_chat on public.hessian_contracts;
create trigger hessian_contract_chat after insert or update of status on public.hessian_contracts
  for each row execute function public.tg_hessian_contract_chat();
drop trigger if exists mercenary_contract_chat on public.mercenary_contracts;
create trigger mercenary_contract_chat after insert or update of status on public.mercenary_contracts
  for each row execute function public.tg_mercenary_contract_chat();

-- None of these are callable by players
do $r$
declare f text;
begin
  foreach f in array array[
    'chat_add(uuid,uuid,text)', 'chat_remove(uuid,uuid)', 'org_war_side(uuid,uuid)',
    'war_add(uuid,text,uuid,text)', 'war_remove(uuid,uuid,boolean)', 'sync_org_member(uuid,uuid)',
    'sync_company_member(uuid,uuid)', 'sync_regiment_member(uuid,uuid)', 'merc_side(public.mercenary_contracts)',
    'open_war_chats(uuid)', 'close_war_chats(uuid)', 'tg_greek_org_chat()', 'tg_org_membership_chat()',
    'tg_hessian_company_chat()', 'tg_hessian_member_chat()', 'tg_regiment_chat()', 'tg_regiment_member_chat()',
    'tg_turf_claim_chat()', 'tg_hessian_contract_chat()', 'tg_mercenary_contract_chat()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $r$;

-- ── Access rules ────────────────────────────────────────────────────────────
create or replace function public.can_read_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels c
                  where c.id = p_channel and c.channel_type <> 'direct'
                    and (c.channel_type = 'battlefield'
                         or exists (select 1 from public.channel_members m
                                     where m.channel_id = c.id and m.user_id = auth.uid())))
$$;

create or replace function public.can_post_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels c
                   join public.channel_members m on m.channel_id = c.id and m.user_id = auth.uid()
                  where c.id = p_channel and c.is_active and c.channel_type <> 'direct')
$$;
revoke all on function public.can_read_channel(uuid) from public, anon;
revoke all on function public.can_post_channel(uuid) from public, anon;
grant execute on function public.can_read_channel(uuid) to authenticated;
grant execute on function public.can_post_channel(uuid) to authenticated;

-- Channels: read yours and any Battlefield; nobody creates them but the server
drop policy if exists "insert_own_channels" on public.channels;
drop policy if exists "member channels" on public.channels;
drop policy if exists "select_visible_channels" on public.channels;
create policy "read your channels and battlefields" on public.channels
  for select to authenticated using (public.can_read_channel(id));

-- Membership: the server adds and removes; players see the member list of channels they can read
drop policy if exists "insert_battlefield_membership" on public.channel_members;
drop policy if exists "insert_invited_membership" on public.channel_members;
drop policy if exists "delete_own_membership" on public.channel_members;
drop policy if exists "select_channel_memberships" on public.channel_members;
create policy "read members of readable channels" on public.channel_members
  for select to authenticated using (public.can_read_channel(channel_id));
create policy "mute own membership" on public.channel_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.channel_members from authenticated;
grant update (muted) on public.channel_members to authenticated;

-- Messages: read what you can read; post only as yourself, only where you're a member of a live chat
drop policy if exists "member messages" on public.messages;
drop policy if exists "select_channel_messages" on public.messages;
drop policy if exists "send messages" on public.messages;
drop policy if exists "insert_own_messages" on public.messages;
create policy "read messages in readable channels" on public.messages
  for select to authenticated using (public.can_read_channel(channel_id));
create policy "post as yourself in your live chats" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and public.can_post_channel(channel_id));

-- ── Backfill existing factions ──────────────────────────────────────────────
insert into public.channels (channel_type, name, org_id)
select 'war_room', o.name || ' War Room', o.id from public.greek_orgs o on conflict do nothing;
insert into public.channels (channel_type, name, hessian_company_id)
select 'hessian', h.name || ' Comms', h.id from public.hessian_companies h on conflict do nothing;
insert into public.channels (channel_type, name, regiment_id)
select 'regiment', r.name || ' Regiment', r.id from public.regiments r on conflict do nothing;
select public.sync_org_member(org_id, user_id) from public.org_memberships;
select public.sync_company_member(id, captain_id) from public.hessian_companies;
select public.sync_company_member(company_id, user_id) from public.hessian_members;
select public.sync_regiment_member(id, captain_id) from public.regiments;
select public.sync_regiment_member(regiment_id, user_id) from public.regiment_members;
select public.open_war_chats(id) from public.turf_claims where status = 'live';
