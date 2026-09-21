-- BarWars Migration 006
-- Seeds Oxford Square venues, adds location columns, promo types, age verification flag

insert into venues (
  name, slug, address, city, state,
  total_capacity, music_hall_capacity, bull_patio_capacity, sports_lounge_capacity,
  wins, losses
)
values
  ('The Library Sports Bar', 'the-library', '120 S 11th St', 'Oxford', 'MS', 400, 150, 120, 130, 0, 0),
  ('Funky''s Pizza & Daiquiri Bar', 'funkys', 'Oxford Square', 'Oxford', 'MS', 250, 80, 100, 70, 0, 0),
  ('Rooster''s Blues House', 'roosters', 'Oxford Square', 'Oxford', 'MS', 200, 120, 40, 40, 0, 0)
on conflict (slug) do update set name = excluded.name, address = excluded.address;

alter table venues
  add column if not exists lat  numeric(9,6),
  add column if not exists lon  numeric(9,6),
  add column if not exists description text,
  add column if not exists image_url   text,
  add column if not exists rating      numeric(3,1) default 4.5;

update venues set lat = 34.366100, lon = -89.534500,
  description = 'Iconic Ole Miss hangout with cold beer, pub grub, and game-day energy.', rating = 4.6
where slug = 'the-library';

update venues set lat = 34.365500, lon = -89.536000,
  description = 'Slices, frozen daiquiris, and a rooftop view of the Square.', rating = 4.4
where slug = 'funkys';

update venues set lat = 34.364800, lon = -89.539800,
  description = 'Live blues, smoky vibes, and the best wings near the Grove.', rating = 4.7
where slug = 'roosters';

create table if not exists promo_types (
  key         text primary key,
  label       text not null,
  icon        text,
  maps_to     text not null
);

insert into promo_types (key, label, icon, maps_to) values
  ('trivia',     'Trivia Night',   '🧠', 'event'),
  ('happy_hour', 'Happy Hour',     '🍺', 'fire_sale'),
  ('live_music', 'Live Music',     '🎸', 'event'),
  ('game_day',   'Game Day',       '🏈', 'demand_event')
on conflict (key) do nothing;

alter table profiles
  add column if not exists age_verified       boolean not null default false,
  add column if not exists location_opt_in    boolean not null default false,
  add column if not exists push_opt_in        boolean not null default false;