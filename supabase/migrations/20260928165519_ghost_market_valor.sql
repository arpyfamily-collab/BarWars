-- Item 12b: the Ghost market, on Valor only for the pilot (Brian, Sep 28): earned, never bought.
-- A Ghost files a report tied to one war with an exclusive price and a second price (Valor).
-- For 1 hour the first side of that war to pay the exclusive price gets it alone, forever.
-- Unsold after the hour: an anonymized headcount posts to the public feed, and the full report
-- stays for sale to any org leader, Hessian captain or intel-cell member at the second price.
-- Guardrails: price 10-100 (rookie ceiling 40 for a Ghost's first 3 reports), 3 reports per Ghost
-- per war, no reporting on a war your own faction is part of, buyers rate after the war and can
-- flag a fake for staff review. Buyers never see who the Ghost is, only the codename's record.

alter table public.ghost_reports
  add column if not exists price integer,
  add column if not exists second_price integer,
  add column if not exists status text not null default 'held' check (status in ('held', 'sold', 'public')),
  add column if not exists release_at timestamptz,
  add column if not exists is_rookie boolean not null default false,
  add column if not exists sold_at timestamptz;

create table if not exists public.ghost_report_purchases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ghost_reports(id) on delete cascade,
  buyer_user_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.greek_orgs(id) on delete cascade,
  company_id uuid references public.hessian_companies(id) on delete cascade,
  price integer not null,
  exclusive boolean not null default false,
  rating smallint check (rating between 1 and 5),
  flagged_at timestamptz,
  flag_note text,
  flag_status text check (flag_status in ('pending', 'refunded', 'dismissed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(org_id, company_id) = 1)
);
create unique index if not exists ghost_purchase_org on public.ghost_report_purchases(report_id, org_id) where org_id is not null;
create unique index if not exists ghost_purchase_company on public.ghost_report_purchases(report_id, company_id) where company_id is not null;
alter table public.ghost_report_purchases enable row level security;

-- Ghost data is written by the server only (players could insert reports and edit their own
-- report count and upgrade flag directly)
drop policy if exists "insert own ghost profile" on public.ghost_profiles;
drop policy if exists "update own ghost profile" on public.ghost_profiles;
drop policy if exists "insert own ghost reports" on public.ghost_reports;

-- Spend Valor (the mirror of credit_valor)
create or replace function public.debit_valor(p_user uuid, p_amount integer, p_desc text, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; bal integer;
begin
  select id, balance into w, bal from public.war_bond_wallets where owner_id = p_user and bond_type = 'valor' for update;
  if w is null or bal < p_amount then raise exception 'NOT_ENOUGH_VALOR'; end if;
  update public.war_bond_wallets set balance = balance - p_amount, lifetime_spent = lifetime_spent + p_amount where id = w;
  insert into public.war_bond_transactions (tx_type, bond_type, amount, from_wallet_id, description, source_ref)
  values ('spend', 'valor', p_amount, w, p_desc, p_ref);
end $$;

-- Is this player on a side of this war (member of either org, company contracted, merc hired, or a mole for a side)?
create or replace function public.in_war_faction(p_user uuid, p_claim uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.turf_claims c join public.org_memberships m on m.org_id in (c.attacking_org_id, c.defending_org_id)
                  where c.id = p_claim and m.user_id = p_user and m.verified)
      or exists (select 1 from public.hessian_contracts h join public.hessian_members hm on hm.company_id = h.company_id
                  where h.claim_id = p_claim and hm.user_id = p_user and h.status in ('pending', 'accepted', 'betrayed', 'completed'))
      or exists (select 1 from public.hessian_contracts h join public.hessian_companies co on co.id = h.company_id
                  where h.claim_id = p_claim and co.captain_id = p_user)
      or exists (select 1 from public.mercenary_contracts k join public.mercenaries me on me.id = k.mercenary_id
                  where k.claim_id = p_claim and me.user_id = p_user and k.status in ('pending', 'accepted', 'completed'));
$$;

-- The side (org or company) a player buys for in a war: they lead it or sit in its intel cell
create or replace function public.buyer_side(p_user uuid, p_claim uuid)
returns table (org_id uuid, company_id uuid) language sql stable security definer set search_path = public as $$
  select o, null::uuid from public.turf_claims c, unnest(array[c.attacking_org_id, c.defending_org_id]) o
   where c.id = p_claim and o is not null
     and (public.is_org_leader(o, p_user)
          or exists (select 1 from public.intel_cells ic join public.intel_cell_members im on im.cell_id = ic.id
                      where ic.claim_id = p_claim and ic.org_id = o and im.user_id = p_user and im.removed_at is null))
  union
  select null::uuid, h.company_id from public.hessian_contracts h
   where h.claim_id = p_claim and h.status in ('accepted', 'betrayed', 'completed')
     and (exists (select 1 from public.hessian_companies co where co.id = h.company_id and co.captain_id = p_user)
          or exists (select 1 from public.intel_cells ic join public.intel_cell_members im on im.cell_id = ic.id
                      where ic.claim_id = p_claim and ic.company_id = h.company_id and im.user_id = p_user and im.removed_at is null));
$$;

-- A Ghost files a priced report
create or replace function public.file_ghost_report(p_user uuid, p_claim uuid, p_observation text, p_orgs text, p_headcount integer,
                                                    p_price integer, p_second_price integer)
returns json language plpgsql security definer set search_path = public as $$
declare g public.ghost_profiles%rowtype; c public.turf_claims%rowtype; n int; rookie boolean; new_id uuid;
begin
  select * into g from public.ghost_profiles where user_id = p_user for update;
  if not found then raise exception 'NOT_A_GHOST'; end if;
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

-- Buy a report: exclusive during the hour (first side of the war to pay), then non-exclusive at the second price
create or replace function public.buy_ghost_report(p_user uuid, p_report uuid, p_org uuid, p_company uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r public.ghost_reports%rowtype; ghost_user uuid; price int; excl boolean;
begin
  select * into r from public.ghost_reports where id = p_report for update;
  if not found or r.price is null then raise exception 'NOT_FOR_SALE'; end if;
  if num_nonnulls(p_org, p_company) <> 1 then raise exception 'INVALID_SIDE'; end if;
  select user_id into ghost_user from public.ghost_profiles where id = r.ghost_id;
  if ghost_user = p_user then raise exception 'OWN_REPORT'; end if;
  if exists (select 1 from public.ghost_report_purchases where report_id = p_report
              and org_id is not distinct from p_org and company_id is not distinct from p_company) then raise exception 'ALREADY_BOUGHT'; end if;

  if r.status = 'held' and now() < r.release_at then
    -- Exclusive window: only a side of this war, through its leader or intel cell
    if not exists (select 1 from public.buyer_side(p_user, r.claim_id) b
                    where b.org_id is not distinct from p_org and b.company_id is not distinct from p_company) then raise exception 'NOT_A_SIDE'; end if;
    price := r.price; excl := true;
    update public.ghost_reports set status = 'sold', sold_at = now() where id = p_report;
  elsif r.status = 'public' or (r.status = 'held' and now() >= r.release_at) then
    -- Non-exclusive: any org leader, Hessian captain or intel-cell member
    if not (public.is_side_leader(p_user, p_org, p_company)
            or exists (select 1 from public.intel_cells ic join public.intel_cell_members im on im.cell_id = ic.id
                        where ic.org_id is not distinct from p_org and ic.company_id is not distinct from p_company
                          and im.user_id = p_user and im.removed_at is null)) then raise exception 'NOT_A_SIDE'; end if;
    price := r.second_price; excl := false;
  else
    raise exception 'SOLD_EXCLUSIVE';
  end if;

  perform public.debit_valor(p_user, price, 'Ghost report', p_report::text);
  perform public.credit_valor(ghost_user, price, 'Ghost report sold', p_report::text);
  insert into public.ghost_report_purchases (report_id, buyer_user_id, org_id, company_id, price, exclusive)
  values (p_report, p_user, p_org, p_company, price, excl);
  return json_build_object('report_id', p_report, 'price', price, 'exclusive', excl);
end $$;

-- After the hour: unsold reports go public (anonymized headcount on the war feed)
create or replace function public.release_ghost_reports()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select gr.id, gr.claim_id, gr.bar_id, gr.headcount_estimate, gp.codename, v.name bar_name
             from public.ghost_reports gr join public.ghost_profiles gp on gp.id = gr.ghost_id
             left join public.venues v on v.id = gr.bar_id
            where gr.status = 'held' and gr.release_at <= now() for update of gr skip locked loop
    update public.ghost_reports set status = 'public' where id = r.id;
    if r.bar_id is not null then
      insert into public.turf_events (claim_id, event_type, bar_id, headline, body, deep_link, visible_to)
      values (r.claim_id, 'ghost_report', r.bar_id,
              format('Ghost %s reports %s at %s', r.codename,
                     case when r.headcount_estimate is not null then 'about ' || r.headcount_estimate || ' on the ground' else 'movement' end,
                     coalesce(r.bar_name, 'the bar')),
              'Full report for sale to org leaders and intel cells.', '/turf-wars/spies', 'public');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- A buyer rates a report after its war resolves, or flags it as fake for staff review
create or replace function public.rate_ghost_report(p_user uuid, p_report uuid, p_rating int, p_flag_note text)
returns json language plpgsql security definer set search_path = public as $$
declare p public.ghost_report_purchases%rowtype; st text;
begin
  select * into p from public.ghost_report_purchases where report_id = p_report and buyer_user_id = p_user for update;
  if not found then raise exception 'NOT_BUYER'; end if;
  if p_flag_note is not null and length(trim(p_flag_note)) > 0 then
    update public.ghost_report_purchases set flagged_at = now(), flag_note = left(p_flag_note, 500), flag_status = 'pending' where id = p.id;
    return json_build_object('flagged', true);
  end if;
  select c.status into st from public.ghost_reports r join public.turf_claims c on c.id = r.claim_id where r.id = p_report;
  if st in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'RATE_AFTER_WAR'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'BAD_RATING'; end if;
  update public.ghost_report_purchases set rating = p_rating where id = p.id;
  return json_build_object('rating', p_rating);
end $$;

-- A Ghost's public record (codename only)
create or replace function public.ghost_record(p_ghost uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'reports', (select count(*) from public.ghost_reports where ghost_id = p_ghost),
    'sold', (select count(*) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'valor_earned', (select coalesce(sum(p.price), 0) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost),
    'rating', (select round(avg(p.rating)::numeric, 1) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost and p.rating is not null),
    'ratings', (select count(p.rating) from public.ghost_report_purchases p join public.ghost_reports r on r.id = p.report_id where r.ghost_id = p_ghost));
$$;

-- The clock releases unsold Ghost reports every minute too
create or replace function public.run_turf_war_clock()
returns json language plpgsql security definer set search_path = public as $$
declare opened int; resolved int := 0; released int; r record;
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
  released := public.release_ghost_reports();
  return json_build_object('opened', opened, 'resolved', resolved, 'ghost_released', released);
end $$;

revoke all on function public.debit_valor(uuid, integer, text, text), public.in_war_faction(uuid, uuid), public.buyer_side(uuid, uuid),
  public.file_ghost_report(uuid, uuid, text, text, integer, integer, integer), public.buy_ghost_report(uuid, uuid, uuid, uuid),
  public.release_ghost_reports(), public.rate_ghost_report(uuid, uuid, int, text), public.ghost_record(uuid) from public, anon, authenticated;
grant execute on function public.debit_valor(uuid, integer, text, text), public.in_war_faction(uuid, uuid), public.buyer_side(uuid, uuid),
  public.file_ghost_report(uuid, uuid, text, text, integer, integer, integer), public.buy_ghost_report(uuid, uuid, uuid, uuid),
  public.release_ghost_reports(), public.rate_ghost_report(uuid, uuid, int, text), public.ghost_record(uuid) to service_role;
