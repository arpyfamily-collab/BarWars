create extension if not exists "uuid-ossp";

create table venues (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null,
  slug                    text not null unique,
  address                 text not null,
  city                    text not null,
  state                   text not null,
  total_capacity          int  not null default 400,
  music_hall_capacity     int  not null default 150,
  bull_patio_capacity     int  not null default 120,
  sports_lounge_capacity  int  not null default 130,
  logo_url                text,
  stripe_account_id       text,
  wins   int not null default 0,
  losses int not null default 0,
  current_streak          int not null default 0,
  forfeit_unpaid_count    int not null default 0,
  created_at              timestamptz default now()
);

create type night_tier as enum ('slow', 'standard', 'marquee');
create type pass_type  as enum ('full_venue', 'music_hall', 'bull_patio', 'sports_lounge');

create table events (
  id                       uuid primary key default uuid_generate_v4(),
  venue_id                 uuid not null references venues(id) on delete cascade,
  name                     text not null,
  date                     date not null,
  night_tier               night_tier not null default 'standard',
  full_venue_price         int not null,
  music_hall_price         int not null,
  bull_patio_price         int not null,
  sports_lounge_price      int not null,
  full_venue_capacity      int not null,
  music_hall_capacity      int not null,
  bull_patio_capacity      int not null,
  sports_lounge_capacity   int not null,
  full_venue_sold          int not null default 0,
  music_hall_sold          int not null default 0,
  bull_patio_sold          int not null default 0,
  sports_lounge_sold       int not null default 0,
  fire_sale_active         boolean not null default false,
  fire_sale_discount_cents int not null default 0,
  fire_sale_expires_at     timestamptz,
  fire_sale_limit          int not null default 50,
  fire_sale_claimed        int not null default 0,
  notes                    text,
  created_at               timestamptz default now(),
  unique (venue_id, date)
);

create table time_windows (
  id               uuid primary key default uuid_generate_v4(),
  event_id         uuid not null references events(id) on delete cascade,
  label            text not null,
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  grace_minutes    int not null default 20,
  total_slots      int not null,
  booked_slots     int not null default 0,
  pass_types       pass_type[] not null default '{full_venue,music_hall,bull_patio,sports_lounge}',
  price_modifier   numeric(4,2) not null default 1.0
);

create type pass_status as enum ('active', 'redeemed', 'expired', 'cancelled', 'pending_renewal');

create table passes (
  id                        uuid primary key default uuid_generate_v4(),
  event_id                  uuid not null references events(id),
  user_id                   uuid not null references auth.users(id),
  pass_type                 pass_type not null,
  status                    pass_status not null default 'active',
  qr_token                  uuid not null unique default uuid_generate_v4(),
  time_window_id            uuid references time_windows(id),
  arrival_deadline          timestamptz,
  stripe_payment_intent_id  text,
  amount_paid               int not null,
  redeemed_at               timestamptz,
  redeemed_by               uuid references auth.users(id),
  renewal_count             int not null default 0,
  renewal_fee_cents         int not null default 0,
  created_at                timestamptz default now()
);

create index passes_qr_token_idx on passes(qr_token);
create index passes_user_id_idx  on passes(user_id);
create index passes_event_id_idx on passes(event_id);

create type subscription_status as enum ('active', 'paused', 'cancelled');

create table library_card_subscriptions (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid not null unique references auth.users(id),
  venue_id                    uuid not null references venues(id),
  stripe_subscription_id      text not null unique,
  stripe_customer_id          text not null,
  status                      subscription_status not null default 'active',
  current_period_start        timestamptz not null,
  current_period_end          timestamptz not null,
  billing_paused              boolean not null default false,
  passes_per_month            int not null default 4,
  passes_remaining_this_month int not null default 4,
  created_at                  timestamptz default now()
);

create table fire_sales (
  id               uuid primary key default uuid_generate_v4(),
  event_id         uuid not null references events(id),
  triggered_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  discount_percent int not null default 100,
  max_claims       int not null default 50,
  claimed          int not null default 0,
  pass_types       pass_type[] not null default '{full_venue}',
  notification_sent boolean not null default false
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  is_staff   boolean not null default false,
  age_verified    boolean not null default false,
  location_opt_in boolean not null default false,
  push_opt_in     boolean not null default false,
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function reserve_pass(p_event_id uuid, p_pass_type text)
returns boolean language plpgsql as $$
declare v_cap int; v_sold int;
begin
  select
    case p_pass_type when 'full_venue' then full_venue_capacity when 'music_hall' then music_hall_capacity when 'bull_patio' then bull_patio_capacity when 'sports_lounge' then sports_lounge_capacity end,
    case p_pass_type when 'full_venue' then full_venue_sold when 'music_hall' then music_hall_sold when 'bull_patio' then bull_patio_sold when 'sports_lounge' then sports_lounge_sold end
  into v_cap, v_sold from events where id = p_event_id for update;
  if v_sold >= v_cap then return false; end if;
  update events set
    full_venue_sold    = full_venue_sold    + case when p_pass_type = 'full_venue'    then 1 else 0 end,
    music_hall_sold    = music_hall_sold    + case when p_pass_type = 'music_hall'    then 1 else 0 end,
    bull_patio_sold    = bull_patio_sold    + case when p_pass_type = 'bull_patio'    then 1 else 0 end,
    sports_lounge_sold = sports_lounge_sold + case when p_pass_type = 'sports_lounge' then 1 else 0 end
  where id = p_event_id;
  return true;
end;
$$;

alter table venues                  enable row level security;
alter table events                  enable row level security;
alter table time_windows            enable row level security;
alter table passes                  enable row level security;
alter table library_card_subscriptions enable row level security;
alter table profiles                enable row level security;

create policy "public read venues"  on venues  for select using (true);
create policy "public read events"  on events  for select using (true);
create policy "public read windows" on time_windows for select using (true);
create policy "own passes"          on passes  for select using (auth.uid() = user_id);
create policy "own subscription"    on library_card_subscriptions for select using (auth.uid() = user_id);
create policy "own profile read"    on profiles for select using (auth.uid() = id);
create policy "own profile update"  on profiles for update using (auth.uid() = id);
