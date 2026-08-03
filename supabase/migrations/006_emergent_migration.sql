-- BarWars Migration 006
-- Migrates Emergent's three Oxford Square bars into the venues table.
-- Maps Emergent's promo/event types to BarWars fire_sales + events concepts.
-- Preserves Emergent's loyalty point model as ambassador credit seed.
-- NO user migration — Supabase Auth handles users fresh (no password hash compat).

-- ─── OXFORD SQUARE VENUE SEED ────────────────────────────────────────────────
-- Coordinates and descriptions taken directly from Emergent's SEED_BARS.
-- The Library is already seeded in migration 001; this upserts it and adds the
-- two new venues. capacity figures are conservative estimates for Oxford Square bars.

insert into venues (
  name, slug, address, city, state,
  total_capacity, music_hall_capacity, bull_patio_capacity, sports_lounge_capacity,
  wins, losses
)
values
  (
    'The Library Sports Bar', 'the-library',
    '120 S 11th St', 'Oxford', 'MS',
    400, 150, 120, 130,
    0, 0
  ),
  (
    'Funky''s Pizza & Daiquiri Bar', 'funkys',
    'Oxford Square', 'Oxford', 'MS',
    250, 80, 100, 70,
    0, 0
  ),
  (
    'Rooster''s Blues House', 'roosters',
    'Oxford Square', 'Oxford', 'MS',
    200, 120, 40, 40,
    0, 0
  )
on conflict (slug) do update set
  name    = excluded.name,
  address = excluded.address;

-- ─── PROMO TYPE → BARWARS EVENT TYPE MAPPING ─────────────────────────────────
-- Emergent's event_type values:
--   trivia       → night_tier: slow     (low-demand, small crowd)
--   happy_hour   → night_tier: standard (default weekend)
--   live_music   → night_tier: standard (bands = Music Hall pass relevant)
--   game_day     → night_tier: marquee  (demand-driven, see demand_events table)
--
-- Emergent's loyalty points (25 per redeem, 100 to redeem = "free drink"):
--   Maps to: ambassador credit system (100 pts = $1 credit, threshold $5 = free drink equiv)
--   We keep the 100-point threshold; 1 QR scan = 25 pts = $0.25 credit.

-- ─── VENUE LOCATION DATA (for geofencing) ────────────────────────────────────
-- Emergent stored lat/lon in MongoDB. Supabase doesn't need them for MVP
-- (geofencing is approximated via push notification radius), but storing them
-- for future PostGIS integration.

alter table venues
  add column if not exists lat  numeric(9,6),
  add column if not exists lon  numeric(9,6),
  add column if not exists description text,
  add column if not exists image_url   text,
  add column if not exists rating      numeric(3,1) default 4.5;

update venues set lat = 34.366100, lon = -89.534500,
  description = 'Iconic Ole Miss hangout with cold beer, pub grub, and game-day energy.',
  rating = 4.6
where slug = 'the-library';

update venues set lat = 34.365500, lon = -89.536000,
  description = 'Slices, frozen daiquiris, and a rooftop view of the Square.',
  rating = 4.4
where slug = 'funkys';

update venues set lat = 34.364800, lon = -89.539800,
  description = 'Live blues, smoky vibes, and the best wings near the Grove.',
  rating = 4.7
where slug = 'roosters';

-- ─── EMERGENT PROMO TYPE REFERENCE TABLE ─────────────────────────────────────
-- Preserves Emergent's event categories as a lookup for the promo feed feature.
-- The promo feed in BarWars maps to fire_sales + mystery_drops + events.

create table if not exists promo_types (
  key         text primary key,
  label       text not null,
  icon        text,
  maps_to     text not null  -- which BarWars feature this surfaces in
);

insert into promo_types (key, label, icon, maps_to) values
  ('trivia',     'Trivia Night',   '🧠', 'event'),
  ('happy_hour', 'Happy Hour',     '🍺', 'fire_sale'),
  ('live_music', 'Live Music',     '🎸', 'event'),
  ('game_day',   'Game Day',       '🏈', 'demand_event')
on conflict (key) do nothing;

-- ─── AGE VERIFICATION FLAG ON PROFILES ───────────────────────────────────────
-- Emergent gates alcohol QR generation behind age_verified.
-- BarWars inherits this — pass purchase for alcohol events requires age check.

alter table profiles
  add column if not exists age_verified       boolean not null default false,
  add column if not exists location_opt_in    boolean not null default false,
  add column if not exists push_opt_in        boolean not null default false;

-- ─── SEED TEST USERS NOTE ────────────────────────────────────────────────────
-- Emergent seeded:
--   admin@olemiss.app   / Admin123!    → role: bar_admin
--   student@olemiss.app / Student123!  → role: user, 75 loyalty_points
--
-- These must be re-created in Supabase Auth (no password hash migration possible
-- since Emergent uses bcrypt via passlib, Supabase uses its own auth).
-- Run this after migration:
--
-- 1. Create users in Supabase Auth dashboard (or via service role):
--    supabase auth admin create-user --email admin@olemiss.app --password Admin123!
--    supabase auth admin create-user --email student@olemiss.app --password Student123!
--
-- 2. Assign bar admin:
--    insert into bar_admins (user_id, bar_id)
--    select '<admin-uuid>', id from venues where slug = 'the-library';
--
-- 3. Seed student ambassador credit (maps Emergent's 75 loyalty points → $0.75 credit):
--    insert into ambassadors (user_id, credit_balance_cents)
--    values ('<student-uuid>', 75);
