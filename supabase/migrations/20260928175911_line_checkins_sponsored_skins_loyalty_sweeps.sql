-- Items 22 (line check-ins), 21 (bar-sponsored skins) and 24 (loyalty tests).

-- ── Item 22: a location check-in means "I'm here / in line" and counts at half; a QR scan inside
--    upgrades it to full. Turnout still counts the person in full. A little Valor for time in line.
alter table public.turf_checkins
  add column if not exists line_since timestamptz,
  add column if not exists upgraded_at timestamptz,
  add column if not exists line_valor_paid boolean not null default false;
alter table public.venues add column if not exists barwars_line boolean not null default false;

-- 1 Valor per 10 minutes in line, up to 5; paid once, on scan-in or when the war ends
create or replace function public.pay_line_valor(p_checkin uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare t record; mins numeric; v int;
begin
  select tc.*, c.window_close_at into t from public.turf_checkins tc join public.turf_claims c on c.id = tc.claim_id
   where tc.id = p_checkin for update of tc;
  if not found or t.line_since is null or t.line_valor_paid then return 0; end if;
  mins := extract(epoch from (coalesce(t.upgraded_at, least(now(), t.window_close_at)) - t.line_since)) / 60;
  v := least(5, greatest(0, floor(mins / 10)))::int;
  update public.turf_checkins set line_valor_paid = true where id = p_checkin;
  if v > 0 then perform public.credit_valor(t.user_id, v, 'Time in line at a Turf War', 'line:' || p_checkin); end if;
  return v;
end $$;

-- Scanning the QR inside upgrades a line check-in to full strength
create or replace function public.upgrade_line_checkin(p_user uuid, p_claim uuid, p_weight numeric)
returns json language plpgsql security definer set search_path = public as $$
declare cid uuid; v int;
begin
  update public.turf_checkins set method = 'qr_scan', headcount_weight = p_weight, upgraded_at = now()
   where claim_id = p_claim and user_id = p_user and line_since is not null and upgraded_at is null
  returning id into cid;
  if cid is null then return null; end if;
  v := public.pay_line_valor(cid);
  perform public.recount_turf_claim(p_claim);
  return json_build_object('checkin_id', cid, 'line_valor', v);
end $$;

-- ── Item 21: skins a bar sponsors, unlocked only by checking in at that bar during a live war there
alter table public.skins add column if not exists sponsor_venue_id uuid references public.venues(id) on delete set null;

create or replace function public.tg_unlock_bar_skins()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not exists (select 1 from public.turf_claims where id = new.claim_id and status in ('live', 'contested') and bar_id = new.bar_id) then return new; end if;
  if exists (select 1 from public.profiles where id = new.user_id and (is_burner or account_status = 'flagged')) then return new; end if;
  for s in select id, max_supply, sold_count from public.skins
            where sponsor_venue_id = new.bar_id and active
              and (available_from is null or available_from <= now()) and (available_until is null or available_until > now())
            order by created_at for update loop
    continue when s.max_supply is not null and s.sold_count >= s.max_supply;
    insert into public.user_skins (user_id, skin_id, ownership_type, amount_paid) values (new.user_id, s.id, 'earned', 0)
    on conflict (user_id, skin_id) do nothing;
    if found then update public.skins set sold_count = sold_count + 1 where id = s.id; end if;
  end loop;
  return new;
end $$;
drop trigger if exists unlock_bar_skins on public.turf_checkins;
create trigger unlock_bar_skins after insert on public.turf_checkins for each row execute function public.tg_unlock_bar_skins();

-- ── Item 24: loyalty sweeps. A leader orders one (once every 30 days); fake approaches go to a
--    random quarter of the org's members (1 to 10). They look exactly like real approaches.
alter table public.leadership_alerts drop constraint if exists leadership_alerts_kind_check;
alter table public.leadership_alerts add constraint leadership_alerts_kind_check
  check (kind in ('loyalty_susceptible', 'loyalty_confirmed', 'loyalty_sweep'));

create table if not exists public.loyalty_sweeps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.greek_orgs(id) on delete cascade,
  ordered_by uuid references public.profiles(id) on delete set null,
  targets integer not null,
  created_at timestamptz not null default now()
);
alter table public.loyalty_sweeps enable row level security;
alter table public.spy_recruitments add column if not exists sweep_id uuid references public.loyalty_sweeps(id) on delete set null;

create or replace function public.order_loyalty_sweep(p_user uuid, p_org uuid)
returns json language plpgsql security definer set search_path = public as $$
declare pool int; n int; sw uuid; last timestamptz;
begin
  if not public.is_org_leader(p_org, p_user) then raise exception 'NOT_LEADER'; end if;
  perform 1 from public.greek_orgs where id = p_org for update;
  select max(created_at) into last from public.loyalty_sweeps where org_id = p_org;
  if last is not null and last > now() - interval '30 days' then raise exception 'SWEEP_COOLDOWN:%', to_char(last + interval '30 days', 'Mon DD'); end if;
  select count(*) into pool from public.org_memberships m
   where m.org_id = p_org and m.verified and m.role = 'member' and m.user_id <> p_user
     and not exists (select 1 from public.spy_recruitments r where r.target_user_id = m.user_id and r.status = 'pending');
  if pool = 0 then raise exception 'NO_TARGETS'; end if;
  n := least(10, greatest(1, ceil(pool * 0.25)))::int;
  insert into public.loyalty_sweeps (org_id, ordered_by, targets) values (p_org, p_user, n) returning id into sw;
  insert into public.spy_recruitments (target_user_id, recruiter_type, recruiter_org_id, status, is_platform_test, sweep_id)
  select m.user_id, 'rival_org', (select g.id from public.greek_orgs g where g.id <> p_org order by random() limit 1), 'pending', true, sw
    from public.org_memberships m
   where m.org_id = p_org and m.verified and m.role = 'member' and m.user_id <> p_user
     and not exists (select 1 from public.spy_recruitments r where r.target_user_id = m.user_id and r.status = 'pending')
   order by random() limit n;
  insert into public.leadership_alerts (org_id, kind, headline, body)
  values (p_org, 'loyalty_sweep', format('Loyalty sweep sent to %s members', n),
          'Fake approaches went out. You''ll get an alert when someone accepts or reports one. Names are never shown.');
  return json_build_object('sweep_id', sw, 'targets', n);
end $$;

-- Counts only, never names
create or replace function public.loyalty_sweep_status(p_user uuid, p_org uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare last record;
begin
  if not public.is_org_leader(p_org, p_user) then raise exception 'NOT_LEADER'; end if;
  select * into last from public.loyalty_sweeps where org_id = p_org order by created_at desc limit 1;
  return json_build_object(
    'last_sweep_at', last.created_at,
    'next_sweep_at', case when last.created_at is null then null else last.created_at + interval '30 days' end,
    'last', case when last.id is null then null else (select json_build_object(
        'sent', count(*),
        'accepted', count(*) filter (where loyalty_flag = 'susceptible'),
        'reported', count(*) filter (where loyalty_flag = 'high_loyalty'),
        'ignored', count(*) filter (where status = 'deleted'),
        'pending', count(*) filter (where status = 'pending'))
      from public.spy_recruitments where sweep_id = last.id) end);
end $$;

-- The clock pays line Valor when wars end
create or replace function public.run_turf_war_clock()
returns json language plpgsql security definer set search_path = public as $$
declare opened int; resolved int := 0; released int; plans int; r record; t record;
begin
  update public.turf_claims set status = 'live'
   where status = 'pending' and window_open_at <= now() and window_close_at > now();
  get diagnostics opened = row_count;
  update public.turf_claims set status = 'cancelled', cancel_reason = 'Window passed before the war opened'
   where status = 'pending' and window_close_at <= now();
  for r in select id from public.turf_claims where status in ('live', 'contested') and window_close_at <= now() loop
    perform public.resolve_turf_war(r.id);
    perform public.complete_war_contracts(r.id);
    for t in select id from public.turf_checkins where claim_id = r.id and line_since is not null and not line_valor_paid loop
      perform public.pay_line_valor(t.id);
    end loop;
    resolved := resolved + 1;
  end loop;
  released := public.release_ghost_reports();
  plans := public.fire_battle_plans();
  return json_build_object('opened', opened, 'resolved', resolved, 'ghost_released', released, 'battle_plans_fired', plans);
end $$;

revoke all on function public.pay_line_valor(uuid), public.upgrade_line_checkin(uuid, uuid, numeric),
  public.order_loyalty_sweep(uuid, uuid), public.loyalty_sweep_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_line_valor(uuid), public.upgrade_line_checkin(uuid, uuid, numeric),
  public.order_loyalty_sweep(uuid, uuid), public.loyalty_sweep_status(uuid, uuid) to service_role;
