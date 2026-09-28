-- 1. War feed: only the server posts events (any player could post fake "war declared" / "turf lost"
--    headlines under any org), and players read only public events ('orgs_only' rows leaked).
drop policy if exists "auth insert turf_events" on public.turf_events;
drop policy if exists "public read turf_events" on public.turf_events;
create policy "read public turf_events" on public.turf_events for select to anon, authenticated
  using (visible_to = 'public');

-- 2. Leadership alerts: private notices for an org's leaders (verified admins), e.g. loyalty alerts.
--    Never identifies the member. Written by the server only.
create table if not exists public.leadership_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.greek_orgs(id) on delete cascade,
  kind text not null check (kind in ('loyalty_susceptible', 'loyalty_confirmed')),
  headline text not null,
  body text,
  created_at timestamptz not null default now()
);
create index if not exists leadership_alerts_org_idx on public.leadership_alerts(org_id, created_at desc);
alter table public.leadership_alerts enable row level security;
create policy "org leaders read their alerts" on public.leadership_alerts for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.org_id = leadership_alerts.org_id and m.user_id = auth.uid()
                   and m.verified and m.role = 'admin'));

-- 3. Skins: players could grant themselves any skin (paid or badge-locked) and equip skins they
--    don't own, straight from the app. Grants and equips go through the server routes only.
drop policy if exists "insert_own_user_skins" on public.user_skins;
drop policy if exists "insert_own_loadout" on public.user_skin_loadout;
drop policy if exists "own loadout update" on public.user_skin_loadout;

-- 4. The skin sold counter the purchase route has always called (it never existed)
create or replace function public.increment_skin_sold_count(p_skin_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.skins set sold_count = coalesce(sold_count, 0) + 1 where id = p_skin_id;
$$;
revoke all on function public.increment_skin_sold_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_skin_sold_count(uuid) to service_role;
