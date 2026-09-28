-- Item 11 "fix first": bar_admins rows flagged is_bar_asset are bar employees working as spies, not
-- managers. They must never pass the bar-admin check (Flares, Battle Plans, door codes, redemptions).
create or replace function public.is_bar_admin(p_user uuid, p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bar_admins where user_id = p_user and bar_id = p_venue and not coalesce(is_bar_asset, false))
      or exists (select 1 from public.profiles where id = p_user and is_staff);
$$;
