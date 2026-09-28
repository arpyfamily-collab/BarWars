-- BarWars: items 12 (spy intel leak) and 13 (Armory) on the Testing To-Do
-- Decided by Brian, Sep 28, 2026:
--   * Until intel cells exist, only the org leader (org_memberships.role = 'admin') or the
--     Hessian captain sees mole intel. Intel never carries the mole's identity.
--   * A Mole Hunt burns only a real rival mole; a wrong guess spends the hunt, nothing public.
--   * Donating to the Armory credits 25 Valor and the Quartermaster badge for real.
--   * Armory: 1 claim per player per rolling 7 days, no total cap; can't claim your own donation.

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.is_org_leader(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_memberships
                 where org_id = p_org and user_id = p_user and verified and role = 'admin')
$$;

create or replace function public.is_company_captain(p_company uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hessian_companies where id = p_company and captain_id = p_user)
$$;

-- True when p_user may read intel filed by this asset: the asset themselves, or the handler's leader
create or replace function public.can_read_asset_intel(p_asset uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.spy_assets a
     where a.id = p_asset
       and (a.asset_user_id = p_user
            or (a.handler_org_id is not null and public.is_org_leader(a.handler_org_id, p_user))
            or (a.handler_company_id is not null and public.is_company_captain(a.handler_company_id, p_user))))
$$;

revoke all on function public.is_org_leader(uuid, uuid) from public, anon;
revoke all on function public.is_company_captain(uuid, uuid) from public, anon;
revoke all on function public.can_read_asset_intel(uuid, uuid) from public, anon;
grant execute on function public.is_org_leader(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_company_captain(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_read_asset_intel(uuid, uuid) to authenticated, service_role;

-- ── Item 12: spy tables ─────────────────────────────────────────────────────
-- Mole records: only the mole reads their own row. Nobody writes directly; the server does.
drop policy if exists "read own spy assets" on public.spy_assets;
drop policy if exists "update own spy assets" on public.spy_assets;
create policy "asset reads own record" on public.spy_assets
  for select to authenticated using (asset_user_id = auth.uid());

-- Intel: the filing mole or the handler's leader. Filing goes through the server (burn check, expiry).
drop policy if exists "read own spy intel" on public.spy_intel;
drop policy if exists "insert spy intel as asset" on public.spy_intel;
create policy "asset or handler leader reads intel" on public.spy_intel
  for select to authenticated using (public.can_read_asset_intel(asset_id));

-- Cultivations: the target, or the cultivating side's leader. Responses go through the server.
drop policy if exists "read own cultivations" on public.spy_cultivations;
drop policy if exists "respond cultivation as target" on public.spy_cultivations;
create policy "target or cultivator leader reads" on public.spy_cultivations
  for select to authenticated using (
    target_user_id = auth.uid()
    or (cultivator_org_id is not null and public.is_org_leader(cultivator_org_id))
    or (cultivator_company_id is not null and public.is_company_captain(cultivator_company_id)));

drop policy if exists "respond own recruitment" on public.spy_recruitments;

-- Mole Hunt resolution: leader only; burns only a real rival mole in the org.
create or replace function public.resolve_mole_hunt(p_user uuid, p_hunt uuid, p_suspect uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h record; is_mole boolean; org_name text;
begin
  select * into h from public.mole_hunts where id = p_hunt for update;
  if not found then raise exception 'HUNT_NOT_FOUND'; end if;
  if h.status <> 'active' then raise exception 'HUNT_ALREADY_RESOLVED'; end if;
  if not public.is_org_leader(h.org_id, p_user) then raise exception 'NOT_ORG_LEADER'; end if;

  -- A real mole: a verified member of this org who is an active asset handled by someone else
  select exists (
    select 1 from public.spy_assets a
     where a.asset_user_id = p_suspect and a.is_active and not a.burned
       and (a.handler_company_id is not null or a.handler_org_id is distinct from h.org_id)
  ) and exists (
    select 1 from public.org_memberships m
     where m.org_id = h.org_id and m.user_id = p_suspect and m.verified
  ) into is_mole;

  if not is_mole then
    update public.mole_hunts set status = 'no_mole', resolved_at = now() where id = p_hunt;
    return jsonb_build_object('status', 'no_mole');
  end if;

  update public.mole_hunts set status = 'mole_found', suspected_mole_id = p_suspect, resolved_at = now()
   where id = p_hunt;
  update public.spy_assets set is_active = false, burned = true, burned_at = now(), burned_by_org_id = h.org_id
   where asset_user_id = p_suspect and is_active;
  insert into public.spy_badges (user_id, badge_type, awarded_by_org_id, detail)
  values (p_suspect, 'burned', h.org_id, 'Burned: ' || to_char(now(), 'Mon DD, YYYY'));

  select name into org_name from public.greek_orgs where id = h.org_id;
  insert into public.turf_events (event_type, org_id, bar_id, headline, body, deep_link, visible_to)
  values ('war_declared', h.org_id, h.fake_bar_id,
          'MOLE BURNED — ' || coalesce(org_name, 'An org') || ' exposed a spy in their ranks',
          'A member of ' || coalesce(org_name, 'an org') || ' was burned as a spy. The "Burned" badge is now permanently visible on their profile.',
          '/turf-wars/spies', 'public');
  return jsonb_build_object('status', 'mole_found');
end $$;
revoke all on function public.resolve_mole_hunt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_mole_hunt(uuid, uuid, uuid) to service_role;

-- ── Item 13: Armory ─────────────────────────────────────────────────────────
-- Players never touch the table directly; the server lists, claims and donates.
drop policy if exists "insert_armory" on public.armory;
drop policy if exists "update_armory" on public.armory;
drop policy if exists "select_armory" on public.armory;
drop policy if exists "public read armory" on public.armory;

-- A bracelet enters the Armory at most once
create unique index if not exists armory_bracelet_unique on public.armory (bracelet_id) where bracelet_id is not null;

-- General player badges (Quartermaster first)
create table if not exists public.player_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  detail text,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge)
);
alter table public.player_badges enable row level security;
create policy "read own player badges" on public.player_badges
  for select to authenticated using (user_id = auth.uid());

-- Credit Valor to a user's wallet (creates the wallet on first credit)
create or replace function public.credit_valor(p_user uuid, p_amount int, p_desc text, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  insert into public.war_bond_wallets (owner_type, owner_id, bond_type, balance, lifetime_earned, lifetime_spent)
  values ('user', p_user, 'valor', 0, 0, 0)
  on conflict (owner_id, bond_type) do nothing;
  update public.war_bond_wallets
     set balance = balance + p_amount, lifetime_earned = lifetime_earned + p_amount
   where owner_id = p_user and bond_type = 'valor'
  returning id into w;
  insert into public.war_bond_transactions (tx_type, bond_type, amount, to_wallet_id, description, source_ref)
  values ('earn', 'valor', p_amount, w, p_desc, p_ref);
end $$;
revoke all on function public.credit_valor(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.credit_valor(uuid, int, text, text) to service_role;

-- Keep or donate a found bracelet, atomically. Called by the bracelet-scan function with the signed-in user.
create or replace function public.bracelet_found(p_user uuid, p_qr uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; a uuid; bar text;
begin
  if p_action not in ('keep', 'donate') then raise exception 'INVALID_ACTION'; end if;
  update public.bracelet_drops
     set status = (case when p_action = 'keep' then 'kept' else 'donated' end)::bracelet_status,
         found_by = p_user, found_at = now()
   where qr_token = p_qr and status = 'hidden'
  returning id, venue_id, offer_type, offer_value into b;
  if not found then raise exception 'ALREADY_FOUND'; end if;
  select name into bar from public.venues where id = b.venue_id;

  if p_action = 'donate' then
    insert into public.armory (bracelet_id, original_venue_id, current_venue_id, donated_by, donated_at, status)
    values (b.id, b.venue_id, b.venue_id, p_user, now(), 'available')
    returning id into a;
    perform public.credit_valor(p_user, 25, 'Armory donation', 'armory:' || a);
    insert into public.player_badges (user_id, badge, detail)
    values (p_user, 'quartermaster', 'Donated a bracelet to the Armory')
    on conflict (user_id, badge) do nothing;
  end if;

  return jsonb_build_object('id', b.id, 'status', case when p_action = 'keep' then 'kept' else 'donated' end,
                            'offer_type', b.offer_type, 'offer_value', b.offer_value, 'bar_name', bar,
                            'armory_id', a, 'valor_bonds', case when p_action = 'donate' then 25 else 0 end);
end $$;
revoke all on function public.bracelet_found(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bracelet_found(uuid, uuid, text) to service_role;

-- Claim from the Armory: 1 per player per rolling 7 days, never your own donation.
create or replace function public.claim_armory(p_user uuid, p_armory uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; bar text; b record;
begin
  perform pg_advisory_xact_lock(hashtext('armory_claim:' || p_user));
  if exists (select 1 from public.armory where claimed_by = p_user and claimed_at > now() - interval '7 days') then
    raise exception 'WEEKLY_LIMIT';
  end if;
  select * into r from public.armory where id = p_armory for update;
  if not found or r.status <> 'available' then raise exception 'NOT_AVAILABLE'; end if;
  if r.donated_by = p_user then raise exception 'OWN_DONATION'; end if;

  update public.armory set status = 'claimed', claimed_by = p_user, claimed_at = now() where id = p_armory;
  update public.bracelet_drops set status = 'armory_claimed' where id = r.bracelet_id;
  select offer_type, offer_value into b from public.bracelet_drops where id = r.bracelet_id;
  select name into bar from public.venues where id = r.current_venue_id;
  return jsonb_build_object('id', p_armory, 'offer_type', b.offer_type, 'offer_value', b.offer_value, 'bar_name', bar);
end $$;
revoke all on function public.claim_armory(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_armory(uuid, uuid) to service_role;
