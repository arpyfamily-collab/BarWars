-- Item 25: hired Hessians and headcount-filler mercenaries check in to wars for the side that hired
-- them, at 0.75x. Each check-in now has a kind; only members count toward turnout.
alter table public.turf_checkins
  add column if not exists kind text not null default 'member' check (kind in ('member', 'ally', 'hessian', 'mercenary')),
  add column if not exists hessian_contract_id uuid references public.hessian_contracts(id) on delete set null,
  add column if not exists mercenary_contract_id uuid references public.mercenary_contracts(id) on delete set null;
update public.turf_checkins set kind = 'ally' where ally_id is not null and kind = 'member';

-- Counts: a Double Cross moves that company's check-ins to the rival, even if they checked in first
create or replace function public.recount_turf_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select attacking_org_id, defending_org_id into c from public.turf_claims where id = p_claim;
  if not found then return; end if;
  with counted as (
    select t.kind, t.headcount_weight,
           case when t.kind = 'hessian' and hc.status = 'betrayed' and hc.double_cross_org_id is not null
                then hc.double_cross_org_id else t.org_id end as side_org
    from public.turf_checkins t
    left join public.hessian_contracts hc on hc.id = t.hessian_contract_id
    where t.claim_id = p_claim
      and not exists (select 1 from public.flagged_checkins f where f.checkin_id = t.id and f.status <> 'approved')
  )
  update public.turf_claims set
    attacker_verified_headcount = (select count(*) from counted where side_org = c.attacking_org_id and kind = 'member'),
    defender_verified_headcount = (select count(*) from counted where side_org = c.defending_org_id and kind = 'member'),
    attacker_weighted_headcount = (select coalesce(sum(headcount_weight), 0) from counted where side_org = c.attacking_org_id),
    defender_weighted_headcount = (select coalesce(sum(headcount_weight), 0) from counted where side_org = c.defending_org_id)
  where id = p_claim;
end $$;

-- When a war is refereed, contracts whose people showed up are completed
create or replace function public.complete_war_contracts(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct hc.id, hc.company_id from public.hessian_contracts hc
           join public.turf_checkins t on t.hessian_contract_id = hc.id
           where hc.claim_id = p_claim and hc.status = 'accepted' loop
    update public.hessian_contracts set status = 'completed', resolved_at = now() where id = r.id;
    update public.hessian_companies set contracts_completed = contracts_completed + 1 where id = r.company_id;
  end loop;
  for r in select distinct mc.id, mc.mercenary_id from public.mercenary_contracts mc
           join public.turf_checkins t on t.mercenary_contract_id = mc.id
           where mc.claim_id = p_claim and mc.status = 'accepted' loop
    update public.mercenary_contracts set status = 'completed', resolved_at = now() where id = r.id;
    update public.mercenaries set contracts_completed = contracts_completed + 1 where id = r.mercenary_id;
  end loop;
end $$;
revoke all on function public.complete_war_contracts(uuid) from public, anon, authenticated;
grant execute on function public.complete_war_contracts(uuid) to service_role;

-- The clock completes contracts right after refereeing each war
create or replace function public.run_turf_war_clock()
returns json language plpgsql security definer set search_path = public as $$
declare opened int; resolved int := 0; r record;
begin
  update public.turf_claims set status = 'live'
   where status = 'pending' and window_open_at <= now() and window_close_at > now();
  get diagnostics opened = row_count;
  update public.turf_claims set status = 'cancelled', cancel_reason = 'Window passed before the war opened'
   where status = 'pending' and window_close_at <= now();
  for r in select id from public.turf_claims where status in ('live', 'contested') and window_close_at <= now() loop
    perform public.resolve_turf_war(r.id);
    perform public.complete_war_contracts(r.id);
    resolved := resolved + 1;
  end loop;
  return json_build_object('opened', opened, 'resolved', resolved);
end $$;
