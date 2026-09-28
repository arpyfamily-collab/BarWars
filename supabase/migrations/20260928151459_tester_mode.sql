-- Item 6: tester mode. Staff flag accounts as testers; a tester can place themselves at a bar
-- on the War Map from anywhere. Map presence feeds no scoring, rewards or leaderboards, and
-- check-ins use their own location check, so a virtual placement only ever puts a dot on the map.
alter table public.profiles add column if not exists is_tester boolean not null default false;
alter table public.user_skin_loadout add column if not exists virtual_until timestamptz;
-- guard_profile_protected_columns() now also locks is_tester (full function as applied live).
