-- Item 18 Phase 2 (Comms Warfare), the decided core: Signal Jam, Forged Orders, Command notices,
-- Decrypt and Flare Blackout (Brian, Sep 26). Only the two war side chats and the Battlefield are ever
-- affected; team chats, intel cells, Report and Block never are.

create table if not exists public.comms_effects (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  kind text not null check (kind in ('jam', 'blackout')),
  target_side text check (target_side in ('attacker', 'defender')),   -- null = every war chat (blackout)
  by_side text check (by_side in ('attacker', 'defender')),
  used_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists comms_effects_claim on public.comms_effects(claim_id, ends_at);
alter table public.comms_effects enable row level security;

-- Official "Command" notices. Only the server can post one (a trigger refuses any other insert);
-- whether it was forged lives in a server-only table, so the enemy can't query it.
alter table public.messages add column if not exists is_command boolean not null default false;
create table if not exists public.command_notices (
  message_id uuid primary key references public.messages(id) on delete cascade,
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  side text not null check (side in ('attacker', 'defender')),
  forged boolean not null,
  author uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.command_notices enable row level security;
create table if not exists public.comms_decrypts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  side text not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  forged boolean not null,
  created_at timestamptz not null default now(),
  unique (message_id, side)
);
alter table public.comms_decrypts enable row level security;

create or replace function public.tg_messages_command_only_server()
returns trigger language plpgsql as $$
begin
  if new.is_command and coalesce(current_setting('barwars.command_ok', true), '') <> '1' then raise exception 'COMMAND_SERVER_ONLY'; end if;
  return new;
end $$;
drop trigger if exists messages_command_only_server on public.messages;
create trigger messages_command_only_server before insert or update of is_command on public.messages
  for each row execute function public.tg_messages_command_only_server();

-- Is a war chat frozen right now?
create or replace function public.war_chat_frozen(p_claim uuid, p_side text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(ends_at) from public.comms_effects
   where claim_id = p_claim and now() >= starts_at and now() < ends_at
     and (kind = 'blackout' or (kind = 'jam' and target_side = p_side));
$$;

-- Posting rule: members of an active, non-direct channel; war chats also can't be jammed or blacked out
create or replace function public.can_post_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c join public.channel_members m on m.channel_id = c.id and m.user_id = auth.uid()
     where c.id = p_channel and c.is_active and c.channel_type <> 'direct'
       and not (c.claim_id is not null and c.channel_type in ('war_side', 'battlefield')
                and public.war_chat_frozen(c.claim_id, case when c.channel_type = 'war_side' then c.side else null end) is not null))
$$;

-- Which side a user can jam for: that side's spies (active, unburned) or mercenaries hired for this war
create or replace function public.comms_jam_side(p_user uuid, p_claim uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare c record; o uuid;
begin
  select attacking_org_id a, defending_org_id d into c from public.turf_claims where id = p_claim;
  select handler_org_id into o from public.spy_assets
   where asset_user_id = p_user and is_active and not coalesce(burned, false) and handler_org_id in (c.a, c.d) limit 1;
  if o is null then
    select mc.hirer_org_id into o from public.mercenaries m join public.mercenary_contracts mc on mc.mercenary_id = m.id
     where m.user_id = p_user and m.is_active and mc.claim_id = p_claim and mc.status = 'accepted' and mc.hirer_org_id in (c.a, c.d) limit 1;
  end if;
  return case when o is null then null when o = c.a then 'attacker' else 'defender' end;
end $$;

-- Signal Jam: attacker side 1 jam of 5 minutes, defender side 2 of 10; a side just released is immune 10 minutes
create or replace function public.signal_jam(p_user uuid, p_claim uuid)
returns json language plpgsql security definer set search_path = public as $$
declare st text; side text; target text; used int; mins int; ends timestamptz;
begin
  select status into st from public.turf_claims where id = p_claim for update;
  if st is null or st not in ('live', 'contested') then raise exception 'WAR_NOT_LIVE'; end if;
  side := public.comms_jam_side(p_user, p_claim);
  if side is null then raise exception 'NOT_ELIGIBLE'; end if;
  target := case when side = 'attacker' then 'defender' else 'attacker' end;
  select count(*) into used from public.comms_effects where claim_id = p_claim and kind = 'jam' and by_side = side;
  if used >= (case when side = 'attacker' then 1 else 2 end) then raise exception 'NO_JAMS_LEFT'; end if;
  if public.war_chat_frozen(p_claim, target) is not null then raise exception 'ALREADY_FROZEN'; end if;
  if exists (select 1 from public.comms_effects where claim_id = p_claim and kind = 'jam' and target_side = target
              and ends_at > now() - interval '10 minutes') then raise exception 'TARGET_IMMUNE'; end if;
  mins := case when side = 'attacker' then 5 else 10 end;
  ends := now() + make_interval(mins => mins);
  insert into public.comms_effects (claim_id, kind, target_side, by_side, used_by, ends_at) values (p_claim, 'jam', target, side, p_user, ends);
  return json_build_object('target', target, 'minutes', mins, 'ends_at', ends, 'jams_left', (case when side = 'attacker' then 1 else 2 end) - used - 1);
end $$;

-- Post a Command notice into a side's war chat (server only)
create or replace function public.post_command_notice(p_claim uuid, p_side text, p_template text, p_bar uuid, p_forged boolean, p_author uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare ch uuid; bar text; txt text; mid uuid;
begin
  select id into ch from public.channels where claim_id = p_claim and channel_type = 'war_side' and side = p_side and is_active limit 1;
  if ch is null then raise exception 'NO_WAR_CHAT'; end if;
  if p_template in ('regroup', 'fall_back', 'push') then
    select name into bar from public.venues where id = p_bar and turf_enabled;
    if bar is null then raise exception 'BAD_BAR'; end if;
  end if;
  txt := case p_template
    when 'regroup' then format('COMMAND: Regroup at %s. Move now.', bar)
    when 'fall_back' then format('COMMAND: Fall back to %s and hold there.', bar)
    when 'push' then format('COMMAND: All units push to %s.', bar)
    when 'hold' then 'COMMAND: Hold your position. Wait for word.'
    else null end;
  if txt is null then raise exception 'BAD_TEMPLATE'; end if;
  perform set_config('barwars.command_ok', '1', true);
  insert into public.messages (channel_id, sender_id, content, is_command) values (ch, null, txt, true) returning id into mid;
  perform set_config('barwars.command_ok', '', true);
  insert into public.command_notices (message_id, claim_id, side, forged, author) values (mid, p_claim, p_side, p_forged, p_author);
  return mid;
end $$;

-- A side's leader posts a real Command notice to their own side (10 per war)
create or replace function public.command_order(p_user uuid, p_claim uuid, p_template text, p_bar uuid)
returns json language plpgsql security definer set search_path = public as $$
declare c record; v_side text; n int;
begin
  select * into c from public.turf_claims where id = p_claim;
  if c.status is null or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  v_side := case when public.is_org_leader(c.attacking_org_id, p_user) then 'attacker'
               when c.defending_org_id is not null and public.is_org_leader(c.defending_org_id, p_user) then 'defender' end;
  if v_side is null then raise exception 'NOT_LEADER'; end if;
  select count(*) into n from public.command_notices where claim_id = p_claim and command_notices.side = v_side and not forged and author = p_user;
  if n >= 10 then raise exception 'ORDER_LIMIT'; end if;
  return json_build_object('message_id', public.post_command_notice(p_claim, v_side, p_template, p_bar, false, p_user), 'side', v_side);
end $$;

-- Forged Orders: a mole (a spy for one side who is a verified member of the other) posts a fake
-- Command notice into the enemy chat; 2 per mole per war; lands even during a jam
create or replace function public.forge_order(p_user uuid, p_claim uuid, p_template text, p_bar uuid)
returns json language plpgsql security definer set search_path = public as $$
declare c record; handler uuid; target text; n int;
begin
  select * into c from public.turf_claims where id = p_claim;
  if c.status is null or c.status not in ('live', 'contested') or c.defending_org_id is null then raise exception 'WAR_NOT_LIVE'; end if;
  select sa.handler_org_id into handler from public.spy_assets sa
   where sa.asset_user_id = p_user and sa.is_active and not coalesce(sa.burned, false) and sa.handler_org_id in (c.attacking_org_id, c.defending_org_id)
     and exists (select 1 from public.org_memberships m where m.user_id = p_user and m.verified
                  and m.org_id = case when sa.handler_org_id = c.attacking_org_id then c.defending_org_id else c.attacking_org_id end)
   limit 1;
  if handler is null then raise exception 'NOT_A_MOLE'; end if;
  target := case when handler = c.attacking_org_id then 'defender' else 'attacker' end;
  select count(*) into n from public.command_notices where claim_id = p_claim and forged and author = p_user;
  if n >= 2 then raise exception 'FORGE_LIMIT'; end if;
  return json_build_object('message_id', public.post_command_notice(p_claim, target, p_template, p_bar, true, p_user), 'target', target, 'left', 1 - n);
end $$;

-- Decrypt: the side's intel cell checks a Command notice in their chat (2 per side per war; works during a jam)
create or replace function public.decrypt_notice(p_user uuid, p_message uuid)
returns json language plpgsql security definer set search_path = public as $$
declare n record; org uuid; used int; prior record;
begin
  select cn.*, c.attacking_org_id, c.defending_org_id into n
    from public.command_notices cn join public.turf_claims c on c.id = cn.claim_id where cn.message_id = p_message;
  if not found then raise exception 'NOT_A_NOTICE'; end if;
  org := case when n.side = 'attacker' then n.attacking_org_id else n.defending_org_id end;
  if not exists (select 1 from public.intel_cells ic join public.intel_cell_members icm on icm.cell_id = ic.id
                  where ic.claim_id = n.claim_id and ic.org_id = org and icm.user_id = p_user and icm.removed_at is null)
     and not public.is_org_leader(org, p_user) then raise exception 'NOT_IN_CELL'; end if;
  select * into prior from public.comms_decrypts where message_id = p_message and side = n.side;
  if found then return json_build_object('forged', prior.forged, 'already', true); end if;
  select count(*) into used from public.comms_decrypts where claim_id = n.claim_id and side = n.side;
  if used >= 2 then raise exception 'NO_DECRYPTS_LEFT'; end if;
  insert into public.comms_decrypts (claim_id, side, message_id, user_id, forged) values (n.claim_id, n.side, p_message, p_user, n.forged);
  return json_build_object('forged', n.forged, 'already', false, 'left', 1 - used);
end $$;

-- What the war page's Comms panel shows this player
create or replace function public.comms_status(p_user uuid, p_claim uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c record; my_side text; jam_side text; cell_side text;
begin
  select * into c from public.turf_claims where id = p_claim;
  my_side := public.war_role(p_user, p_claim)->>'side';
  jam_side := public.comms_jam_side(p_user, p_claim);
  select case when ic.org_id = c.attacking_org_id then 'attacker' else 'defender' end into cell_side
    from public.intel_cells ic join public.intel_cell_members icm on icm.cell_id = ic.id
   where ic.claim_id = p_claim and icm.user_id = p_user and icm.removed_at is null limit 1;
  return json_build_object(
    'attacker_frozen_until', public.war_chat_frozen(p_claim, 'attacker'),
    'defender_frozen_until', public.war_chat_frozen(p_claim, 'defender'),
    'blackout_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'blackout' and now() < ends_at),
    'jam_side', jam_side,
    'jams_left', case when jam_side is null then null else (case when jam_side = 'attacker' then 1 else 2 end)
                  - (select count(*) from public.comms_effects where claim_id = p_claim and kind = 'jam' and by_side = jam_side) end,
    'is_leader', (my_side = 'attacker' and public.is_org_leader(c.attacking_org_id, p_user)) or (my_side = 'defender' and public.is_org_leader(c.defending_org_id, p_user)),
    'is_mole', exists (select 1 from public.spy_assets sa where sa.asset_user_id = p_user and sa.is_active and not coalesce(sa.burned, false)
                        and sa.handler_org_id in (c.attacking_org_id, c.defending_org_id)
                        and exists (select 1 from public.org_memberships m where m.user_id = p_user and m.verified
                                     and m.org_id = case when sa.handler_org_id = c.attacking_org_id then c.defending_org_id else c.attacking_org_id end)),
    'forgeries_left', 2 - (select count(*) from public.command_notices where claim_id = p_claim and forged and author = p_user),
    'decrypt_side', coalesce(cell_side, case when (my_side = 'attacker' and public.is_org_leader(c.attacking_org_id, p_user))
                                               or (my_side = 'defender' and public.is_org_leader(c.defending_org_id, p_user)) then my_side end),
    'bars', (select json_agg(json_build_object('id', id, 'name', name) order by name) from public.venues where turf_enabled));
end $$;

-- Flare Blackout: a Flare at a bar with a live war freezes all of that war's chats for 5-10 minutes, once an hour
create or replace function public.flare_blackout(p_venue uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare w record; n int := 0;
begin
  for w in select id from public.turf_claims where bar_id = p_venue and status in ('live', 'contested') loop
    continue when exists (select 1 from public.comms_effects where claim_id = w.id and kind = 'blackout' and starts_at > now() - interval '1 hour');
    insert into public.comms_effects (claim_id, kind, ends_at) values (w.id, 'blackout', now() + make_interval(mins => 5 + floor(random() * 6)::int));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.fire_flare(p_user uuid, p_venue uuid, p_offer text, p_discount text, p_minutes int)
returns json language plpgsql security definer set search_path = public as $$
declare week date := date_trunc('week', now() at time zone 'America/Chicago')::date; bal int; f record; blackouts int;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  if length(btrim(coalesce(p_offer, ''))) = 0 or length(btrim(coalesce(p_discount, ''))) = 0 then raise exception 'MISSING_FIELDS'; end if;
  perform 1 from public.venues where id = p_venue for update;
  if exists (select 1 from public.flares where venue_id = p_venue and fired_at >= now() - interval '4 hours') then raise exception 'FLARE_COOLDOWN'; end if;
  select balance into bal from public.flare_credits where venue_id = p_venue and week_start = week;
  if bal is not null and bal <= 0 then raise exception 'NO_FLARE_CREDITS'; end if;
  perform set_config('barwars.flare_via_rpc', '1', true);
  insert into public.flares (venue_id, fired_by, offer_text, discount_desc, duration_min, status, expires_at)
  values (p_venue, p_user, btrim(p_offer), btrim(p_discount), coalesce(p_minutes, 60), 'active', now() + make_interval(mins => coalesce(p_minutes, 60)))
  returning id, offer_text, expires_at into f;
  perform set_config('barwars.flare_via_rpc', '', true);
  if bal is not null then
    update public.flare_credits set spent = coalesce(spent, 0) + 1 where venue_id = p_venue and week_start = week;
  else
    insert into public.flare_credits (venue_id, week_start, earned_sub, spent) values (p_venue, week, 3, 1);
  end if;
  blackouts := public.flare_blackout(p_venue);    -- item 18 Phase 2; Battle Plans never trigger this
  return json_build_object('id', f.id, 'offer_text', f.offer_text, 'expires_at', f.expires_at, 'blackouts', blackouts);
end $$;

revoke all on function public.war_chat_frozen(uuid, text), public.comms_jam_side(uuid, uuid), public.signal_jam(uuid, uuid),
  public.post_command_notice(uuid, text, text, uuid, boolean, uuid), public.command_order(uuid, uuid, text, uuid),
  public.forge_order(uuid, uuid, text, uuid), public.decrypt_notice(uuid, uuid), public.comms_status(uuid, uuid), public.flare_blackout(uuid)
  from public, anon, authenticated;
grant execute on function public.war_chat_frozen(uuid, text) to authenticated;   -- used inside can_post_channel
grant execute on function public.war_chat_frozen(uuid, text), public.comms_jam_side(uuid, uuid), public.signal_jam(uuid, uuid),
  public.post_command_notice(uuid, text, text, uuid, boolean, uuid), public.command_order(uuid, uuid, text, uuid),
  public.forge_order(uuid, uuid, text, uuid), public.decrypt_notice(uuid, uuid), public.comms_status(uuid, uuid), public.flare_blackout(uuid)
  to service_role;
