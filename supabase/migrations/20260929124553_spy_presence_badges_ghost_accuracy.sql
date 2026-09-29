-- Item 12 leftovers (Sep 29):
--  1. A bar-observation report requires being at the bar (the route checks location within 100 m, like check-ins)
--  2. Spy badges from reports: Informant (1st), Field Agent (5), Spymaster (15 across 3+ wars)
--  3. Ghost accuracy: how close a Ghost's headcount estimates were to who actually checked in, on decided wars

drop function if exists public.file_spy_intel(uuid, uuid, uuid, text, text);
create or replace function public.file_spy_intel(p_user uuid, p_asset uuid, p_claim uuid, p_type text, p_content text, p_present boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare a public.spy_assets%rowtype; c public.turf_claims%rowtype; n int; new_id uuid; total int; wars int; badge text := null;
begin
  select * into a from public.spy_assets where id = p_asset and asset_user_id = p_user;
  if not found or not a.is_active then raise exception 'NOT_YOUR_ASSET'; end if;
  if a.burned then raise exception 'BURNED'; end if;
  select * into c from public.turf_claims where id = p_claim;
  if not found or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  if not public.handler_in_war(p_claim, a.handler_org_id, a.handler_company_id) then raise exception 'HANDLER_NOT_IN_WAR'; end if;
  if p_type not in ('headcount', 'shots_fired_plan', 'war_declaration_plan', 'bar_observation') then raise exception 'BAD_TYPE'; end if;
  if p_type = 'bar_observation' and not coalesce(p_present, false) then raise exception 'NOT_AT_BAR'; end if;
  if length(coalesce(p_content, '')) < 5 or length(p_content) > 500 then raise exception 'BAD_CONTENT'; end if;
  perform 1 from public.spy_assets where id = p_asset for update;
  select count(*) into n from public.spy_intel where asset_id = p_asset and claim_id = p_claim;
  if n >= 3 then raise exception 'REPORT_LIMIT'; end if;
  insert into public.spy_intel (asset_id, claim_id, intel_type, content, expires_at, handler_org_id, handler_company_id, created_at)
  values (p_asset, p_claim, p_type::spy_intel_type, p_content, c.window_close_at, a.handler_org_id, a.handler_company_id, clock_timestamp())
  returning id into new_id;
  select count(*), count(distinct i.claim_id) into total, wars
    from public.spy_intel i join public.spy_assets s on s.id = i.asset_id where s.asset_user_id = p_user;
  if total >= 15 and wars >= 3 then badge := 'spymaster'; elsif total >= 5 then badge := 'field_agent'; elsif total >= 1 then badge := 'informant'; end if;
  if badge is not null then
    insert into public.spy_badges (user_id, badge_type, detail)
    select p_user, b::spy_badge_type, format('%s reports filed', total)
      from unnest(case badge when 'spymaster' then array['informant', 'field_agent', 'spymaster']
                             when 'field_agent' then array['informant', 'field_agent'] else array['informant'] end) b
    on conflict (user_id, badge_type) do nothing;
  end if;
  return json_build_object('id', new_id, 'reports_left', 2 - n, 'badge', badge);
end $$;
revoke all on function public.file_spy_intel(uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.file_spy_intel(uuid, uuid, uuid, text, text, boolean) to service_role;

create or replace function public.ghost_record(p_ghost uuid)
returns json language sql stable security definer set search_path = public as $$
  with scored as (
    select greatest(0, 1 - abs(r.headcount_estimate - (coalesce(c.attacker_verified_headcount, 0) + coalesce(c.defender_verified_headcount, 0)))::numeric
                           / greatest(coalesce(c.attacker_verified_headcount, 0) + coalesce(c.defender_verified_headcount, 0), 1)) as score
      from public.ghost_reports r join public.turf_claims c on c.id = r.claim_id
     where r.ghost_id = p_ghost and r.headcount_estimate is not null and r.status <> 'fake' and c.status in ('successful', 'failed'))
  select json_build_object(
    'reports', (select count(*) from public.ghost_reports where ghost_id = p_ghost),
    'sold', (select count(*) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'valor_earned', (select coalesce(sum(p.price), 0) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost and r.status <> 'fake'),
    'rating', (select round(avg(p.rating)::numeric, 1) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost and p.rating is not null),
    'ratings', (select count(p.rating) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'ruled_fake', (select count(*) from public.ghost_reports where ghost_id = p_ghost and status = 'fake'),
    'accuracy', (select round(avg(score) * 100) from scored),
    'accuracy_reports', (select count(*) from scored));
$$;
