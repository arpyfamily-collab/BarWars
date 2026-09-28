-- Item 18 Phase 2, Brian's Sep 28 calls: Static shares the Jam budget (a side's disruptions are jam OR
-- static: attacker 1 x 5 min, defender 2 x 10 min, 10-min immunity for both); Ghosts get one Wiretap per
-- war; the After-Action Report is in-app. Radio Silence and Signal Officer counters are dropped.

alter table public.comms_effects drop constraint if exists comms_effects_kind_check;
alter table public.comms_effects add constraint comms_effects_kind_check check (kind in ('jam', 'static', 'blackout'));

-- One budget for jam and static
create or replace function public.signal_jam(p_user uuid, p_claim uuid, p_kind text default 'jam')
returns json language plpgsql security definer set search_path = public as $$
declare st text; side text; target text; used int; mins int; ends timestamptz; cap int;
begin
  if p_kind not in ('jam', 'static') then raise exception 'BAD_KIND'; end if;
  select status into st from public.turf_claims where id = p_claim for update;
  if st is null or st not in ('live', 'contested') then raise exception 'WAR_NOT_LIVE'; end if;
  side := public.comms_jam_side(p_user, p_claim);
  if side is null then raise exception 'NOT_ELIGIBLE'; end if;
  target := case when side = 'attacker' then 'defender' else 'attacker' end;
  cap := case when side = 'attacker' then 1 else 2 end;
  select count(*) into used from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static') and by_side = side;
  if used >= cap then raise exception 'NO_JAMS_LEFT'; end if;
  if public.war_chat_frozen(p_claim, target) is not null
     or exists (select 1 from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = target and now() < ends_at)
  then raise exception 'ALREADY_FROZEN'; end if;
  if exists (select 1 from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static') and target_side = target
              and ends_at > now() - interval '10 minutes') then raise exception 'TARGET_IMMUNE'; end if;
  mins := case when side = 'attacker' then 5 else 10 end;
  ends := now() + make_interval(mins => mins);
  insert into public.comms_effects (claim_id, kind, target_side, by_side, used_by, ends_at) values (p_claim, p_kind, target, side, p_user, ends);
  return json_build_object('kind', p_kind, 'target', target, 'minutes', mins, 'ends_at', ends, 'jams_left', cap - used - 1);
end $$;
drop function if exists public.signal_jam(uuid, uuid);

-- Static garbles about half the words of anything posted in the targeted side chat
create or replace function public.tg_messages_static()
returns trigger language plpgsql security definer set search_path = public as $$
declare ch record;
begin
  if new.is_command then return new; end if;
  select claim_id, channel_type, side into ch from public.channels where id = new.channel_id;
  if ch.claim_id is null or ch.channel_type <> 'war_side' then return new; end if;
  if not exists (select 1 from public.comms_effects where claim_id = ch.claim_id and kind = 'static' and target_side = ch.side
                  and now() >= starts_at and now() < ends_at) then return new; end if;
  new.content := (select string_agg(case when length(w) > 2 and random() < 0.5 then repeat('▒', length(w)) else w end, ' ' order by i)
                    from regexp_split_to_table(new.content, '\s+') with ordinality as t(w, i));
  return new;
end $$;
drop trigger if exists messages_static on public.messages;
create trigger messages_static before insert on public.messages for each row execute function public.tg_messages_static();

-- Ghost Wiretap: one per Ghost per war; reads one side's war chat for 10 minutes, no names
create table if not exists public.ghost_wiretaps (
  id uuid primary key default gen_random_uuid(),
  ghost_id uuid not null references public.ghost_profiles(id) on delete cascade,
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  side text not null check (side in ('attacker', 'defender')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  unique (ghost_id, claim_id)
);
alter table public.ghost_wiretaps enable row level security;

create or replace function public.ghost_wiretap(p_user uuid, p_claim uuid, p_side text)
returns json language plpgsql security definer set search_path = public as $$
declare g record; st text; w record;
begin
  select * into g from public.ghost_profiles where user_id = p_user;
  if not found then raise exception 'NOT_A_GHOST'; end if;
  if g.suspended_at is not null then raise exception 'GHOST_SUSPENDED'; end if;
  if p_side not in ('attacker', 'defender') then raise exception 'BAD_SIDE'; end if;
  select status into st from public.turf_claims where id = p_claim;
  if st is null or st not in ('live', 'contested') then raise exception 'WAR_NOT_LIVE'; end if;
  if public.in_war_faction(p_user, p_claim) then raise exception 'OWN_WAR'; end if;
  begin
    insert into public.ghost_wiretaps (ghost_id, claim_id, side, ends_at) values (g.id, p_claim, p_side, now() + interval '10 minutes') returning * into w;
  exception when unique_violation then raise exception 'WIRETAP_USED';
  end;
  return json_build_object('side', w.side, 'ends_at', w.ends_at);
end $$;

-- What the wiretap picked up: only messages posted during its 10 minutes, labeled by side, never by name
create or replace function public.ghost_wiretap_feed(p_user uuid, p_claim uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('side', w.side, 'starts_at', w.starts_at, 'ends_at', w.ends_at,
    'messages', coalesce((select json_agg(json_build_object('at', m.created_at, 'content', m.content, 'command', m.is_command) order by m.created_at)
                           from public.messages m join public.channels ch on ch.id = m.channel_id
                          where ch.claim_id = w.claim_id and ch.channel_type = 'war_side' and ch.side = w.side
                            and m.created_at >= w.starts_at and m.created_at < least(now(), w.ends_at) and m.status = 'active'), '[]'::json))
  from public.ghost_wiretaps w join public.ghost_profiles g on g.id = w.ghost_id
  where g.user_id = p_user and w.claim_id = p_claim;
$$;

-- After-Action Report (in-app): only once the war is decided. Moles are never named.
create or replace function public.after_action_report(p_claim uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select t.*, v.name bar, ao.name att, dof.name def into c from public.turf_claims t
    left join public.venues v on v.id = t.bar_id left join public.greek_orgs ao on ao.id = t.attacking_org_id
    left join public.greek_orgs dof on dof.id = t.defending_org_id where t.id = p_claim;
  if not found or c.status not in ('successful', 'failed') then return null; end if;
  return json_build_object(
    'bar', c.bar, 'attacker', c.att, 'defender', c.def, 'result', c.result, 'underdog', c.underdog_bonus,
    'attacker_score', c.attacker_score, 'defender_score', c.defender_score,
    'attacker_headcount', c.attacker_weighted_headcount, 'defender_headcount', c.defender_weighted_headcount,
    'timeline', coalesce((select json_agg(e order by e.at) from (
        select starts_at at, case kind when 'blackout' then 'Flare blackout: every war chat went dark'
                                       when 'jam' then format('%s jammed the %s chat', case by_side when 'attacker' then c.att else c.def end, target_side)
                                       else format('%s hit the %s chat with static', case by_side when 'attacker' then c.att else c.def end, target_side) end
               || format(' (%s min)', round(extract(epoch from ends_at - starts_at) / 60)) as what, kind
          from public.comms_effects where claim_id = p_claim
        union all
        select cn.created_at, case when cn.forged
                 then format('Forged order planted in the %s chat by %s''s mole: "%s"', cn.side, case cn.side when 'attacker' then c.def else c.att end, replace(m.content, 'COMMAND: ', ''))
                 else format('%s leader ordered: "%s"', case cn.side when 'attacker' then c.att else c.def end, replace(m.content, 'COMMAND: ', '')) end,
               case when cn.forged then 'forgery' else 'order' end
          from public.command_notices cn join public.messages m on m.id = cn.message_id where cn.claim_id = p_claim
        union all
        select d.created_at, format('%s''s intel cell decrypted an order: %s', case d.side when 'attacker' then c.att else c.def end,
                                    case when d.forged then 'caught a forgery' else 'confirmed it was real' end), 'decrypt'
          from public.comms_decrypts d where d.claim_id = p_claim
        union all
        select w.starts_at, format('Ghost %s wiretapped the %s chat', g.codename, w.side), 'wiretap'
          from public.ghost_wiretaps w join public.ghost_profiles g on g.id = w.ghost_id where w.claim_id = p_claim
      ) e), '[]'::json),
    'crowd', json_build_object(
      'attacker_roars', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'attacker'),
      'defender_roars', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'defender'),
      'shouts', (select count(*) from public.war_shouts where claim_id = p_claim and removed_at is null)));
end $$;

-- War page status now counts jam + static together
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
    'attacker_static_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = 'attacker' and now() < ends_at),
    'defender_static_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = 'defender' and now() < ends_at),
    'blackout_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'blackout' and now() < ends_at),
    'jam_side', jam_side,
    'jams_left', case when jam_side is null then null else (case when jam_side = 'attacker' then 1 else 2 end)
                  - (select count(*) from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static') and by_side = jam_side) end,
    'is_leader', coalesce((my_side = 'attacker' and public.is_org_leader(c.attacking_org_id, p_user)) or (my_side = 'defender' and public.is_org_leader(c.defending_org_id, p_user)), false),
    'is_mole', exists (select 1 from public.spy_assets sa where sa.asset_user_id = p_user and sa.is_active and not coalesce(sa.burned, false)
                        and sa.handler_org_id in (c.attacking_org_id, c.defending_org_id)
                        and exists (select 1 from public.org_memberships m where m.user_id = p_user and m.verified
                                     and m.org_id = case when sa.handler_org_id = c.attacking_org_id then c.defending_org_id else c.attacking_org_id end)),
    'forgeries_left', 2 - (select count(*) from public.command_notices where claim_id = p_claim and forged and author = p_user),
    'decrypt_side', coalesce(cell_side, case when (my_side = 'attacker' and public.is_org_leader(c.attacking_org_id, p_user))
                                               or (my_side = 'defender' and public.is_org_leader(c.defending_org_id, p_user)) then my_side end),
    'bars', (select json_agg(json_build_object('id', id, 'name', name) order by name) from public.venues where turf_enabled));
end $$;

revoke all on function public.signal_jam(uuid, uuid, text), public.ghost_wiretap(uuid, uuid, text), public.ghost_wiretap_feed(uuid, uuid),
  public.after_action_report(uuid) from public, anon, authenticated;
grant execute on function public.signal_jam(uuid, uuid, text), public.ghost_wiretap(uuid, uuid, text), public.ghost_wiretap_feed(uuid, uuid),
  public.after_action_report(uuid) to service_role;
