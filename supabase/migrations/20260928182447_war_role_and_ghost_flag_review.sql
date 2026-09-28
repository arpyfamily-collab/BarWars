-- Item 25 leftover: the war page only knew about org members, so hired Hessians and mercenaries
-- saw no side and a Rally button that failed. war_role() tells the page who you are in a war.
create or replace function public.war_role(p_user uuid, p_claim uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c record; o uuid; kind text; w numeric := 1; ck record; has_ck boolean;
begin
  select * into c from public.turf_claims where id = p_claim;
  if not found then return null; end if;
  select m.org_id into o from public.org_memberships m
   where m.user_id = p_user and m.verified and m.org_id in (c.attacking_org_id, c.defending_org_id) limit 1;
  if o is not null then kind := 'member';
  else
    select case when hc.status = 'betrayed' and hc.double_cross_org_id is not null then hc.double_cross_org_id else hc.org_id end,
           coalesce(hc.agreed_weight, 0.75)
      into o, w
      from public.hessian_members hm join public.hessian_contracts hc on hc.company_id = hm.company_id
     where hm.user_id = p_user and hm.verified and hc.claim_id = p_claim and hc.status in ('accepted', 'betrayed')
       and hc.org_id in (c.attacking_org_id, c.defending_org_id) limit 1;
    if o is not null then kind := 'hessian';
    else
      select mc.hirer_org_id, case when mc.role = 'headcount_filler' then 'mercenary' else 'mercenary_support' end
        into o, kind
        from public.mercenaries m join public.mercenary_contracts mc on mc.mercenary_id = m.id
       where m.user_id = p_user and m.is_active and mc.claim_id = p_claim and mc.status = 'accepted'
         and mc.hirer_org_id in (c.attacking_org_id, c.defending_org_id)
       order by (mc.role = 'headcount_filler') desc limit 1;
      if o is null then return json_build_object('kind', null); end if;
      w := case when kind = 'mercenary' then 0.75 else 0 end;
    end if;
  end if;
  select line_since, upgraded_at into ck from public.turf_checkins where claim_id = p_claim and user_id = p_user;
  has_ck := found;
  return json_build_object(
    'kind', kind, 'side', case when o = c.attacking_org_id then 'attacker' else 'defender' end,
    'org_id', o, 'org_name', (select name from public.greek_orgs where id = o), 'weight', w,
    'can_check_in', kind <> 'mercenary_support',
    'checked_in', has_ck,
    'in_line', has_ck and ck.line_since is not null and ck.upgraded_at is null);
end $$;

-- Item 12 leftover: flagged Ghost reports had no staff review. Staff rule a flagged report fake
-- (every buyer is refunded in Valor, the report is pulled, 2 fakes suspend the Ghost) or dismiss it.
alter table public.ghost_reports drop constraint if exists ghost_reports_status_check;
alter table public.ghost_reports add constraint ghost_reports_status_check check (status in ('held', 'sold', 'public', 'fake'));
alter table public.ghost_profiles add column if not exists suspended_at timestamptz;

create or replace function public.review_ghost_flag(p_staff uuid, p_purchase uuid, p_action text)
returns json language plpgsql security definer set search_path = public as $$
declare pu record; r record; b record; refunded int := 0; fakes int; suspended boolean := false;
begin
  if not exists (select 1 from public.profiles where id = p_staff and is_staff) then raise exception 'STAFF_ONLY'; end if;
  select * into pu from public.ghost_report_purchases where id = p_purchase and flag_status = 'pending' for update;
  if not found then raise exception 'NOT_PENDING'; end if;
  if p_action = 'dismiss' then
    update public.ghost_report_purchases set flag_status = 'dismissed' where id = p_purchase;
    return json_build_object('dismissed', true);
  end if;
  if p_action <> 'fake' then raise exception 'BAD_ACTION'; end if;
  select * into r from public.ghost_reports where id = pu.report_id for update;
  update public.ghost_reports set status = 'fake' where id = r.id;
  for b in select * from public.ghost_report_purchases where report_id = r.id and coalesce(flag_status, '') <> 'refunded' for update loop
    perform public.credit_valor(b.buyer_user_id, b.price, 'Refund: Ghost report ruled fake', 'ghost_refund:' || b.id);
    update public.ghost_report_purchases set flag_status = 'refunded' where id = b.id;
    refunded := refunded + 1;
  end loop;
  select count(*) into fakes from public.ghost_reports where ghost_id = r.ghost_id and status = 'fake';
  if fakes >= 2 then
    update public.ghost_profiles set suspended_at = coalesce(suspended_at, now()) where id = r.ghost_id;
    suspended := true;
  end if;
  return json_build_object('refunded', refunded, 'ghost_fakes', fakes, 'ghost_suspended', suspended);
end $$;

-- Suspended Ghosts can't file; fake reports show on a Ghost's record
create or replace function public.file_ghost_report(p_user uuid, p_claim uuid, p_observation text, p_orgs text, p_headcount integer, p_price integer, p_second_price integer)
returns json language plpgsql security definer set search_path = public as $$
declare g public.ghost_profiles%rowtype; c public.turf_claims%rowtype; n int; rookie boolean; new_id uuid;
begin
  select * into g from public.ghost_profiles where user_id = p_user for update;
  if not found then raise exception 'NOT_A_GHOST'; end if;
  if g.suspended_at is not null then raise exception 'GHOST_SUSPENDED'; end if;
  select * into c from public.turf_claims where id = p_claim;
  if not found or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  if public.in_war_faction(p_user, p_claim) then raise exception 'OWN_WAR'; end if;
  if length(coalesce(p_observation, '')) < 10 or length(p_observation) > 1000 then raise exception 'BAD_CONTENT'; end if;
  select count(*) into n from public.ghost_reports where ghost_id = g.id and claim_id = p_claim;
  if n >= 3 then raise exception 'REPORT_LIMIT'; end if;
  rookie := coalesce(g.reports_count, 0) < 3;
  if p_price is null or p_price < 10 or p_price > (case when rookie then 40 else 100 end) then raise exception 'BAD_PRICE'; end if;
  if p_second_price is null or p_second_price < 10 or p_second_price > p_price then raise exception 'BAD_SECOND_PRICE'; end if;
  insert into public.ghost_reports (ghost_id, claim_id, bar_id, observation, orgs_present, headcount_estimate,
                                    price, second_price, status, release_at, is_rookie, created_at)
  values (g.id, p_claim, c.bar_id, p_observation, nullif(p_orgs, ''), p_headcount, p_price, p_second_price, 'held',
          now() + interval '1 hour', rookie, now())
  returning id into new_id;
  update public.ghost_profiles set reports_count = coalesce(reports_count, 0) + 1,
    upgrade_eligible = upgrade_eligible or coalesce(reports_count, 0) + 1 >= 3 where id = g.id;
  return json_build_object('id', new_id, 'rookie', rookie, 'release_at', now() + interval '1 hour');
end $$;

create or replace function public.ghost_record(p_ghost uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'reports', (select count(*) from public.ghost_reports where ghost_id = p_ghost),
    'sold', (select count(*) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'valor_earned', (select coalesce(sum(p.price), 0) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost and r.status <> 'fake'),
    'rating', (select round(avg(p.rating)::numeric, 1) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost and p.rating is not null),
    'ratings', (select count(p.rating) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'ruled_fake', (select count(*) from public.ghost_reports where ghost_id = p_ghost and status = 'fake'));
$$;

revoke all on function public.war_role(uuid, uuid), public.review_ghost_flag(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.war_role(uuid, uuid), public.review_ghost_flag(uuid, uuid, text) to service_role;
