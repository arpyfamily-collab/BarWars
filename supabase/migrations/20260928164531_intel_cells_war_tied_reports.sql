-- Item 12a: intel cells and war-tied mole reports (design: Brian, Sep 26; defaults Sep 28).
-- When a war is declared, each side's leader (verified org admin, or the captain of a Hessian
-- company contracted for the war) picks an intel cell: themselves + up to 2 members. Until then
-- only the leader reads intel. Swaps are logged; a new member sees only reports filed after they
-- joined. Every mole report is tied to one war, can be filed only while the war is pending or live,
-- is limited to 3 per spy per war, and stops being readable by handlers when the war resolves
-- (the spy keeps it in their own record).

create table if not exists public.intel_cells (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  org_id uuid references public.greek_orgs(id) on delete cascade,
  company_id uuid references public.hessian_companies(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(org_id, company_id) = 1)
);
create unique index if not exists intel_cells_org on public.intel_cells(claim_id, org_id) where org_id is not null;
create unique index if not exists intel_cells_company on public.intel_cells(claim_id, company_id) where company_id is not null;
alter table public.intel_cells enable row level security;

create table if not exists public.intel_cell_members (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.intel_cells(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index if not exists intel_cell_members_active on public.intel_cell_members(cell_id, user_id) where removed_at is null;
alter table public.intel_cell_members enable row level security;

alter table public.spy_intel
  add column if not exists handler_org_id uuid references public.greek_orgs(id) on delete cascade,
  add column if not exists handler_company_id uuid references public.hessian_companies(id) on delete cascade;

-- Is this handler side part of the war? (an org fighting it, or a company contracted for it)
create or replace function public.handler_in_war(p_claim uuid, p_org uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_org is not null and exists (select 1 from public.turf_claims where id = p_claim and p_org in (attacking_org_id, defending_org_id)))
      or (p_company is not null and exists (select 1 from public.hessian_contracts where claim_id = p_claim and company_id = p_company
                                            and status in ('accepted', 'betrayed', 'completed')));
$$;

create or replace function public.is_side_leader(p_user uuid, p_org uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_org is not null and public.is_org_leader(p_org, p_user))
      or (p_company is not null and exists (select 1 from public.hessian_companies where id = p_company and captain_id = p_user));
$$;

-- A mole files a report for one war
create or replace function public.file_spy_intel(p_user uuid, p_asset uuid, p_claim uuid, p_type text, p_content text)
returns json language plpgsql security definer set search_path = public as $$
declare a public.spy_assets%rowtype; c public.turf_claims%rowtype; n int; new_id uuid;
begin
  select * into a from public.spy_assets where id = p_asset and asset_user_id = p_user;
  if not found or not a.is_active then raise exception 'NOT_YOUR_ASSET'; end if;
  if a.burned then raise exception 'BURNED'; end if;
  select * into c from public.turf_claims where id = p_claim;
  if not found or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  if not public.handler_in_war(p_claim, a.handler_org_id, a.handler_company_id) then raise exception 'HANDLER_NOT_IN_WAR'; end if;
  if p_type not in ('headcount', 'shots_fired_plan', 'war_declaration_plan', 'bar_observation') then raise exception 'BAD_TYPE'; end if;
  if length(coalesce(p_content, '')) < 5 or length(p_content) > 500 then raise exception 'BAD_CONTENT'; end if;
  perform 1 from public.spy_assets where id = p_asset for update;
  select count(*) into n from public.spy_intel where asset_id = p_asset and claim_id = p_claim;
  if n >= 3 then raise exception 'REPORT_LIMIT'; end if;
  insert into public.spy_intel (asset_id, claim_id, intel_type, content, expires_at, handler_org_id, handler_company_id, created_at)
  values (p_asset, p_claim, p_type::spy_intel_type, p_content, c.window_close_at, a.handler_org_id, a.handler_company_id, clock_timestamp())
  returning id into new_id;
  return json_build_object('id', new_id, 'reports_left', 2 - n);
end $$;

-- A side's leader sets the intel cell (up to 2 members besides themselves)
create or replace function public.set_intel_cell(p_user uuid, p_claim uuid, p_org uuid, p_company uuid, p_members uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare c public.turf_claims%rowtype; cell public.intel_cells%rowtype; want uuid[]; u uuid; bar text; side_name text; ch uuid;
begin
  if num_nonnulls(p_org, p_company) <> 1 then raise exception 'INVALID_SIDE'; end if;
  if not public.is_side_leader(p_user, p_org, p_company) then raise exception 'NOT_LEADER'; end if;
  select * into c from public.turf_claims where id = p_claim;
  if not found or c.status not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  if not public.handler_in_war(p_claim, p_org, p_company) then raise exception 'HANDLER_NOT_IN_WAR'; end if;

  select coalesce(array_agg(distinct m), '{}') into want from unnest(coalesce(p_members, '{}')) m where m <> p_user;
  if array_length(want, 1) > 2 then raise exception 'CELL_TOO_BIG'; end if;
  foreach u in array want loop
    if p_org is not null and not exists (select 1 from public.org_memberships where org_id = p_org and user_id = u and verified) then raise exception 'NOT_A_MEMBER'; end if;
    if p_company is not null and not exists (select 1 from public.hessian_members where company_id = p_company and user_id = u and verified) then raise exception 'NOT_A_MEMBER'; end if;
  end loop;

  select * into cell from public.intel_cells where claim_id = p_claim and org_id is not distinct from p_org and company_id is not distinct from p_company;
  if not found then
    insert into public.intel_cells (claim_id, org_id, company_id, created_by) values (p_claim, p_org, p_company, p_user) returning * into cell;
  end if;

  update public.intel_cell_members set removed_at = clock_timestamp() where cell_id = cell.id and removed_at is null and user_id <> all(want);
  insert into public.intel_cell_members (cell_id, user_id, added_by, added_at)
  select cell.id, m, p_user, clock_timestamp() from unnest(want) m
  where not exists (select 1 from public.intel_cell_members x where x.cell_id = cell.id and x.user_id = m and x.removed_at is null);

  -- The cell's private chat: the leader plus current members
  if cell.channel_id is null then
    select name into bar from public.venues where id = c.bar_id;
    select coalesce((select name from public.greek_orgs where id = p_org), (select name from public.hessian_companies where id = p_company)) into side_name;
    insert into public.channels (channel_type, name, claim_id, org_id, hessian_company_id, venue_id)
    values ('intel_cell', 'Intel cell: ' || coalesce(side_name, 'your side') || ', war at ' || coalesce(bar, 'the bar'), p_claim, p_org, p_company, c.bar_id)
    returning id into ch;
    update public.intel_cells set channel_id = ch where id = cell.id;
    cell.channel_id := ch;
  end if;
  delete from public.channel_members where channel_id = cell.channel_id and user_id <> all(want || p_user);
  insert into public.channel_members (channel_id, user_id, role)
  select cell.channel_id, m, case when m = p_user then 'leader' else 'member' end from unnest(want || p_user) m
  on conflict (channel_id, user_id) do nothing;

  return json_build_object('cell_id', cell.id, 'members', want, 'channel_id', cell.channel_id);
end $$;

-- What intel a player may read: their own reports as a spy (always), plus, while the war is
-- active, reports to a side they lead or whose cell they joined before the report was filed
create or replace function public.readable_intel(p_user uuid)
returns table (id uuid, claim_id uuid, intel_type text, content text, created_at timestamptz, bar_name text, mine boolean, war_active boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.claim_id, i.intel_type::text, i.content, i.created_at, v.name, a.asset_user_id = p_user,
         c.status in ('pending', 'operator_pending', 'live', 'contested')
  from public.spy_intel i
  join public.spy_assets a on a.id = i.asset_id
  join public.turf_claims c on c.id = i.claim_id
  left join public.venues v on v.id = c.bar_id
  where a.asset_user_id = p_user
     or (c.status in ('pending', 'operator_pending', 'live', 'contested') and (
           public.is_side_leader(p_user, i.handler_org_id, i.handler_company_id)
        or exists (select 1 from public.intel_cells ic join public.intel_cell_members m on m.cell_id = ic.id
                    where ic.claim_id = i.claim_id
                      and ic.org_id is not distinct from i.handler_org_id and ic.company_id is not distinct from i.handler_company_id
                      and m.user_id = p_user and m.removed_at is null and m.added_at <= i.created_at)))
  order by i.created_at desc
  limit 100;
$$;

revoke all on function public.handler_in_war(uuid, uuid, uuid), public.is_side_leader(uuid, uuid, uuid),
  public.file_spy_intel(uuid, uuid, uuid, text, text), public.set_intel_cell(uuid, uuid, uuid, uuid, uuid[]),
  public.readable_intel(uuid) from public, anon, authenticated;
grant execute on function public.handler_in_war(uuid, uuid, uuid), public.is_side_leader(uuid, uuid, uuid),
  public.file_spy_intel(uuid, uuid, uuid, text, text), public.set_intel_cell(uuid, uuid, uuid, uuid, uuid[]),
  public.readable_intel(uuid) to service_role;
