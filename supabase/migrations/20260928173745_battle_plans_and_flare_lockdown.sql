-- Item 19: Battle Plans (Brian, Sep 26: bars pre-set offers that fire automatically when a war happens,
-- so nothing needs a manager's attention while the bar is busy). Plus a Flare security fix.

-- ── Flares: anyone signed in could fire a Flare for any bar (the flare-fire edge function trusted
--    venue_id and fired_by from the request). Firing now goes through fire_flare(), which checks the
--    caller is that bar's admin; a trigger refuses any other insert, so the old edge function can't.
create or replace function public.is_bar_admin(p_user uuid, p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bar_admins where user_id = p_user and bar_id = p_venue)
      or exists (select 1 from public.profiles where id = p_user and is_staff);
$$;

create or replace function public.tg_flares_via_rpc()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('barwars.flare_via_rpc', true), '') <> '1' then
    raise exception 'FLARE_VIA_APP_ONLY';
  end if;
  return new;
end $$;
drop trigger if exists flares_via_rpc on public.flares;
create trigger flares_via_rpc before insert on public.flares for each row execute function public.tg_flares_via_rpc();

create or replace function public.fire_flare(p_user uuid, p_venue uuid, p_offer text, p_discount text, p_minutes int)
returns json language plpgsql security definer set search_path = public as $$
declare week date := date_trunc('week', now() at time zone 'America/Chicago')::date; bal int; f record;
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
  -- balance is computed (earned - spent). A bar's first Flare of the week starts it at 3 (the old
  -- edge function meant this, but its insert wrote the computed column and always failed)
  if bal is not null then
    update public.flare_credits set spent = coalesce(spent, 0) + 1 where venue_id = p_venue and week_start = week;
  else
    insert into public.flare_credits (venue_id, week_start, earned_sub, spent) values (p_venue, week, 3, 1);
  end if;
  return json_build_object('id', f.id, 'offer_text', f.offer_text, 'expires_at', f.expires_at);
end $$;

-- ── Battle Plans
create table if not exists public.battle_plans (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  offer_text text not null check (char_length(offer_text) between 3 and 120),
  details text check (char_length(details) <= 300),
  is_drink boolean not null default false,
  scope text not null default 'my_bar' check (scope in ('my_bar', 'any_war')),
  cap integer not null default 50 check (cap between 1 and 500),
  nights smallint[] not null default '{4,5,6}',          -- 0 = Sunday … 6 = Saturday (Central time)
  expires_at timestamptz not null default now() + interval '30 days',
  paused boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists battle_plans_venue on public.battle_plans(venue_id);
alter table public.battle_plans enable row level security;

create table if not exists public.battle_plan_firings (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.battle_plans(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  night date not null,
  claimed_count integer not null default 0,
  redeemed_count integer not null default 0,
  fired_at timestamptz not null default now(),
  unique (venue_id, night)                              -- at most one Battle Plan per bar per night
);
alter table public.battle_plan_firings enable row level security;

create table if not exists public.battle_plan_claims (
  id uuid primary key default gen_random_uuid(),
  firing_id uuid not null references public.battle_plan_firings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  claimed_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  unique (firing_id, user_id),
  unique (firing_id, code)
);
alter table public.battle_plan_claims enable row level security;

-- The bar's night (Central time; a night runs 6am to 6am)
create or replace function public.bar_night(p_at timestamptz default now())
returns date language sql stable as $$ select ((p_at at time zone 'America/Chicago') - interval '6 hours')::date $$;

-- Fire Battle Plans for wars that qualify: live, two sides, 5+ verified members checked in on each
create or replace function public.fire_battle_plans()
returns integer language plpgsql security definer set search_path = public as $$
declare w record; p record; n int := 0; tonight date := public.bar_night(); dow int := extract(dow from public.bar_night())::int;
begin
  for w in select id, bar_id from public.turf_claims
            where status in ('live', 'contested') and defending_org_id is not null
              and attacker_verified_headcount >= 5 and defender_verified_headcount >= 5 loop
    for p in select bp.* from public.battle_plans bp
              where not bp.paused and bp.expires_at > now() and dow = any(bp.nights)
                and (bp.venue_id = w.bar_id or bp.scope = 'any_war')
                and not exists (select 1 from public.battle_plan_firings f where f.venue_id = bp.venue_id and f.night = tonight)
              order by (bp.venue_id = w.bar_id) desc, bp.created_at loop
      insert into public.battle_plan_firings (plan_id, venue_id, claim_id, night) values (p.id, p.venue_id, w.id, tonight)
      on conflict (venue_id, night) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- A player who checked in to the war claims a Battle Plan offer: first come, first served up to the cap
create or replace function public.claim_battle_plan(p_user uuid, p_firing uuid)
returns json language plpgsql security definer set search_path = public as $$
declare f record; p record; v_code text;
begin
  select * into f from public.battle_plan_firings where id = p_firing for update;
  if not found or f.night <> public.bar_night() then raise exception 'OFFER_OVER'; end if;
  select * into p from public.battle_plans where id = f.plan_id;
  if not exists (select 1 from public.turf_checkins t where t.claim_id = f.claim_id and t.user_id = p_user) then raise exception 'NOT_IN_WAR'; end if;
  select c.code into v_code from public.battle_plan_claims c where c.firing_id = p_firing and c.user_id = p_user;
  if found then return json_build_object('code', v_code, 'already', true); end if;
  if f.claimed_count >= p.cap then raise exception 'CAP_REACHED'; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.battle_plan_claims where firing_id = p_firing and battle_plan_claims.code = v_code);
  end loop;
  insert into public.battle_plan_claims (firing_id, user_id, code) values (p_firing, p_user, v_code);
  update public.battle_plan_firings set claimed_count = claimed_count + 1 where id = p_firing;
  return json_build_object('code', v_code, 'already', false, 'left', p.cap - f.claimed_count - 1);
end $$;

-- Bar staff redeem a code at the door
create or replace function public.redeem_battle_plan(p_user uuid, p_venue uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  select bc.*, bp.offer_text, bp.is_drink into c
    from public.battle_plan_claims bc join public.battle_plan_firings f on f.id = bc.firing_id join public.battle_plans bp on bp.id = f.plan_id
   where f.venue_id = p_venue and f.night = public.bar_night() and bc.code = upper(btrim(p_code))
   for update of bc;
  if not found then raise exception 'CODE_NOT_FOUND'; end if;
  if c.redeemed_at is not null then raise exception 'ALREADY_REDEEMED'; end if;
  update public.battle_plan_claims set redeemed_at = now(), redeemed_by = p_user where id = c.id;
  update public.battle_plan_firings set redeemed_count = redeemed_count + 1 where id = c.firing_id;
  return json_build_object('offer', c.offer_text, 'is_drink', c.is_drink);
end $$;

-- The clock fires Battle Plans every minute too
create or replace function public.run_turf_war_clock()
returns json language plpgsql security definer set search_path = public as $$
declare opened int; resolved int := 0; released int; plans int; r record;
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
  plans := public.fire_battle_plans();
  return json_build_object('opened', opened, 'resolved', resolved, 'ghost_released', released, 'battle_plans_fired', plans);
end $$;

revoke all on function public.is_bar_admin(uuid, uuid), public.fire_flare(uuid, uuid, text, text, int), public.fire_battle_plans(),
  public.claim_battle_plan(uuid, uuid), public.redeem_battle_plan(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.is_bar_admin(uuid, uuid), public.fire_flare(uuid, uuid, text, text, int), public.fire_battle_plans(),
  public.claim_battle_plan(uuid, uuid), public.redeem_battle_plan(uuid, uuid, text) to service_role;
