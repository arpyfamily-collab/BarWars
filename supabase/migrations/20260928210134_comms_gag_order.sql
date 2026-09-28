-- Item 18 Phase 2, Gag Order (Brian, Sep 28: option 2, "gives snipers a legitimate role"). A sniper hired
-- by one side silences the enemy leader's Command orders for 5 minutes. Players can still chat, and
-- forged orders still land. It targets a role, never a person, and counts against the side's shared
-- disruption budget (jam, static or gag: attacker 1, defender 2).

alter table public.comms_effects drop constraint if exists comms_effects_kind_check;
alter table public.comms_effects add constraint comms_effects_kind_check check (kind in ('jam', 'static', 'gag', 'blackout'));

create or replace function public.comms_sniper_side(p_user uuid, p_claim uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when mc.hirer_org_id = c.attacking_org_id then 'attacker' else 'defender' end
    from public.turf_claims c join public.mercenary_contracts mc on mc.claim_id = c.id
    join public.mercenaries m on m.id = mc.mercenary_id
   where c.id = p_claim and m.user_id = p_user and m.is_active and m.is_sniper and mc.status = 'accepted'
     and mc.hirer_org_id in (c.attacking_org_id, c.defending_org_id)
   limit 1;
$$;

create or replace function public.signal_jam(p_user uuid, p_claim uuid, p_kind text default 'jam')
returns json language plpgsql security definer set search_path = public as $$
declare st text; side text; target text; used int; mins int; ends timestamptz; cap int;
begin
  if p_kind not in ('jam', 'static', 'gag') then raise exception 'BAD_KIND'; end if;
  select status into st from public.turf_claims where id = p_claim for update;
  if st is null or st not in ('live', 'contested') then raise exception 'WAR_NOT_LIVE'; end if;
  side := case when p_kind = 'gag' then public.comms_sniper_side(p_user, p_claim) else public.comms_jam_side(p_user, p_claim) end;
  if side is null and p_kind = 'gag' then raise exception 'NOT_A_SNIPER'; end if;
  if side is null then raise exception 'NOT_ELIGIBLE'; end if;
  target := case when side = 'attacker' then 'defender' else 'attacker' end;
  cap := case when side = 'attacker' then 1 else 2 end;
  select count(*) into used from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static', 'gag') and by_side = side;
  if used >= cap then raise exception 'NO_JAMS_LEFT'; end if;
  if p_kind = 'gag' then
    if exists (select 1 from public.comms_effects where claim_id = p_claim and kind = 'gag' and target_side = target and now() < ends_at)
    then raise exception 'ALREADY_GAGGED'; end if;
    mins := 5;
  else
    if public.war_chat_frozen(p_claim, target) is not null
       or exists (select 1 from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = target and now() < ends_at)
    then raise exception 'ALREADY_FROZEN'; end if;
    if exists (select 1 from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static') and target_side = target
                and ends_at > now() - interval '10 minutes') then raise exception 'TARGET_IMMUNE'; end if;
    mins := case when side = 'attacker' then 5 else 10 end;
  end if;
  ends := now() + make_interval(mins => mins);
  insert into public.comms_effects (claim_id, kind, target_side, by_side, used_by, ends_at) values (p_claim, p_kind, target, side, p_user, ends);
  return json_build_object('kind', p_kind, 'target', target, 'minutes', mins, 'ends_at', ends, 'jams_left', cap - used - 1);
end $$;

create or replace function public.command_order(p_user uuid, p_claim uuid, p_template text, p_bar uuid)
returns json language plpgsql security definer set search_path = public as $$
declare c record; v_side text; n int;
begin
  select * into c from public.turf_claims where id = p_claim;
  if c.status is null or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  v_side := case when public.is_org_leader(c.attacking_org_id, p_user) then 'attacker'
               when c.defending_org_id is not null and public.is_org_leader(c.defending_org_id, p_user) then 'defender' end;
  if v_side is null then raise exception 'NOT_LEADER'; end if;
  if exists (select 1 from public.comms_effects where claim_id = p_claim and kind = 'gag' and target_side = v_side and now() >= starts_at and now() < ends_at)
  then raise exception 'ORDERS_GAGGED'; end if;
  select count(*) into n from public.command_notices where claim_id = p_claim and command_notices.side = v_side and not forged and author = p_user;
  if n >= 10 then raise exception 'ORDER_LIMIT'; end if;
  return json_build_object('message_id', public.post_command_notice(p_claim, v_side, p_template, p_bar, false, p_user), 'side', v_side);
end $$;

create or replace function public.comms_status(p_user uuid, p_claim uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c record; my_side text; jam_side text; sniper_side text; cell_side text; eff_side text;
begin
  select * into c from public.turf_claims where id = p_claim;
  my_side := public.war_role(p_user, p_claim)->>'side';
  jam_side := public.comms_jam_side(p_user, p_claim);
  sniper_side := public.comms_sniper_side(p_user, p_claim);
  eff_side := coalesce(jam_side, sniper_side);
  select case when ic.org_id = c.attacking_org_id then 'attacker' else 'defender' end into cell_side
    from public.intel_cells ic join public.intel_cell_members icm on icm.cell_id = ic.id
   where ic.claim_id = p_claim and icm.user_id = p_user and icm.removed_at is null limit 1;
  return json_build_object(
    'attacker_frozen_until', public.war_chat_frozen(p_claim, 'attacker'),
    'defender_frozen_until', public.war_chat_frozen(p_claim, 'defender'),
    'attacker_static_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = 'attacker' and now() < ends_at),
    'defender_static_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'static' and target_side = 'defender' and now() < ends_at),
    'attacker_gagged_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'gag' and target_side = 'attacker' and now() < ends_at),
    'defender_gagged_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'gag' and target_side = 'defender' and now() < ends_at),
    'blackout_until', (select max(ends_at) from public.comms_effects where claim_id = p_claim and kind = 'blackout' and now() < ends_at),
    'jam_side', jam_side,
    'sniper_side', sniper_side,
    'jams_left', case when eff_side is null then null else (case when eff_side = 'attacker' then 1 else 2 end)
                  - (select count(*) from public.comms_effects where claim_id = p_claim and kind in ('jam', 'static', 'gag') and by_side = eff_side) end,
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

-- After-Action Report names gags
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
                                       when 'gag' then format('%s''s sniper gagged the %s leader''s orders', case by_side when 'attacker' then c.att else c.def end, target_side)
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


revoke all on function public.comms_sniper_side(uuid, uuid) from public, anon, authenticated;
grant execute on function public.comms_sniper_side(uuid, uuid) to service_role;
