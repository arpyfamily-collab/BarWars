-- Item 22 follow-up (Brian, Sep 28: option 1). Each bar has a printed door QR with a short code.
-- A full-strength ("inside") check-in needs this code AND a location within 100 m.
create or replace function public.new_door_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;
alter table public.venues add column if not exists checkin_code text;
update public.venues set checkin_code = public.new_door_code() where checkin_code is null;
alter table public.venues alter column checkin_code set default public.new_door_code();
alter table public.venues alter column checkin_code set not null;
create unique index if not exists venues_checkin_code_key on public.venues(checkin_code);
create or replace function public.reset_door_code(p_user uuid, p_venue uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  loop
    c := public.new_door_code();
    exit when not exists (select 1 from public.venues where checkin_code = c);
  end loop;
  update public.venues set checkin_code = c where id = p_venue;
  return c;
end $$;
revoke all on function public.reset_door_code(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reset_door_code(uuid, uuid) to service_role;

-- Players get every venue column except the door code and the Stripe account id
revoke select on public.venues from anon, authenticated;
grant select (id, name, slug, address, city, state, total_capacity, logo_url, wins, losses, current_streak,
  forfeit_unpaid_count, created_at, turf_claim_headcount_pct, turf_maintenance_headcount_pct, turf_sneak_attack_headcount_pct,
  turf_shots_min, turf_sneak_attack_nights, turf_war_nights, turf_maintenance_nights_required, turf_enabled, turf_surge_fee_cents,
  occupied_by_company_id, occupation_expires_at, lat, lon, description, image_url, rating, barwars_line)
  on public.venues to anon, authenticated;
