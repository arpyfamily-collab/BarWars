-- Item 5: real players on the War Map, privacy-first.
-- Opt-in per player; the server stores only which participating bar they're at (never raw
-- coordinates), and the map places them at that bar with a small fixed offset.
alter table public.user_skin_loadout
  add column if not exists share_location boolean not null default false,
  add column if not exists at_venue_id uuid references public.venues(id) on delete set null;

-- Raw coordinates are no longer kept
update public.user_skin_loadout set last_location_lat = null, last_location_lng = null
 where last_location_lat is not null or last_location_lng is not null;
