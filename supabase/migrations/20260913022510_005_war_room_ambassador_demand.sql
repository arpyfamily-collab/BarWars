-- BarWars Migration 005
-- War Room chat, Ambassador program, Bar onboarding, Demand signals

create table war_room_messages (
  id              uuid primary key default uuid_generate_v4(),
  challenge_id    uuid not null references bar_challenges(id) on delete cascade,
  bar_id          uuid not null references venues(id),
  user_id         uuid not null references auth.users(id),
  display_name    text not null,
  body            text not null check (char_length(body) <= 280),
  flagged         boolean not null default false,
  deleted         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index war_room_challenge_bar_idx on war_room_messages(challenge_id, bar_id, created_at);

create table war_room_reactions (
  id           uuid primary key default uuid_generate_v4(),
  message_id   uuid not null references war_room_messages(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  emoji        text not null check (emoji in ('🔥','💪','⚡','👀','😤')),
  created_at   timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table battle_cries (
  id           uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references bar_challenges(id) on delete cascade,
  bar_id       uuid not null references venues(id),
  user_id      uuid not null references auth.users(id),
  cry          text not null check (char_length(cry) <= 60),
  set_at       timestamptz not null default now(),
  unique (challenge_id, bar_id)
);

create type ambassador_tier as enum ('scout', 'soldier', 'captain', 'general');

create table ambassadors (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  referral_code       text not null unique default upper(substr(md5(random()::text), 1, 8)),
  tier                ambassador_tier not null default 'scout',
  lifetime_referrals  int not null default 0,
  lifetime_l2_referrals int not null default 0,
  lifetime_revenue    int not null default 0,
  credit_balance_cents int not null default 0,
  passes_earned        int not null default 0,
  chapter_name        text,
  chapter_code        text,
  created_at          timestamptz not null default now()
);

create index ambassadors_code_idx    on ambassadors(referral_code);
create index ambassadors_chapter_idx on ambassadors(chapter_code) where chapter_code is not null;

create table referral_events (
  id                      uuid primary key default uuid_generate_v4(),
  referrer_id             uuid not null references ambassadors(id),
  referred_user_id        uuid not null references auth.users(id),
  level                   int not null check (level in (1, 2)),
  pass_id                 uuid references passes(id),
  revenue_cents           int not null default 0,
  commission_cents        int not null default 0,
  bar_id                  uuid references venues(id),
  created_at              timestamptz not null default now(),
  unique (referrer_id, referred_user_id, pass_id)
);

create index referral_referrer_idx on referral_events(referrer_id);
create index referral_bar_idx      on referral_events(bar_id);

create table ambassador_compensation (
  id               uuid primary key default uuid_generate_v4(),
  ambassador_id    uuid not null references ambassadors(id),
  bar_id           uuid references venues(id),
  type             text not null check (type in ('pass_credit','drink_credit','cash','upgrade')),
  amount_cents     int not null default 0,
  description      text,
  issued_at        timestamptz not null default now(),
  redeemed         boolean not null default false,
  redeemed_at      timestamptz
);

create or replace view chapter_leaderboard as
  select
    a.chapter_code, a.chapter_name,
    count(distinct a.id) as member_count,
    sum(a.lifetime_referrals + a.lifetime_l2_referrals) as total_referrals,
    sum(a.lifetime_revenue) as total_revenue_cents,
    max(a.tier) as top_tier
  from ambassadors a
  where a.chapter_code is not null
  group by a.chapter_code, a.chapter_name
  order by total_referrals desc;

create or replace function get_tier_for_count(referral_count int)
returns ambassador_tier language plpgsql as $$
begin
  if referral_count >= 30 then return 'general';
  elsif referral_count >= 15 then return 'captain';
  elsif referral_count >= 5  then return 'soldier';
  else return 'scout';
  end if;
end;
$$;

create or replace function get_commission_bps(tier ambassador_tier)
returns int language plpgsql as $$
begin
  case tier
    when 'scout'   then return 500;
    when 'soldier' then return 800;
    when 'captain' then return 1200;
    when 'general' then return 1500;
  end case;
end;
$$;

create table demand_events (
  id                uuid primary key default uuid_generate_v4(),
  event_date        date not null,
  venue_id          uuid not null references venues(id),
  home_team         text, away_team         text,
  home_record       text, away_record       text,
  home_rank         int,  away_rank         int,
  spread            numeric(5,1), total     numeric(5,1),
  game_time         text,
  is_rivalry        boolean not null default false,
  is_conference     boolean not null default false,
  neutral_site      boolean not null default false,
  resale_avg_cents  int,  resale_volume     int,
  demand_score      int not null default 50 check (demand_score between 0 and 100),
  recommended_tier  text not null default 'standard',
  price_multiplier  numeric(4,2) not null default 1.0,
  recommended_release_days_out int not null default 3,
  recommended_pass_limit       int,
  ambassador_incentive_boost   int not null default 0,
  fetched_at        timestamptz not null default now(),
  unique (event_date, venue_id)
);

create index demand_date_idx on demand_events(event_date);

create type bar_status as enum ('applied', 'approved', 'active', 'suspended');

create table bar_applications (
  id                uuid primary key default uuid_generate_v4(),
  venue_name        text not null,
  contact_name      text not null,
  contact_email     text not null,
  contact_phone     text,
  address           text not null,
  city              text not null,
  state             text not null,
  estimated_capacity int,
  monthly_revenue_band text,
  referral_source   text,
  notes             text,
  status            bar_status not null default 'applied',
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  venue_id          uuid references venues(id),
  created_at        timestamptz not null default now()
);

alter table bar_applications enable row level security;
create policy "own application" on bar_applications for select
  using (contact_email = (select email from auth.users where id = auth.uid()));

alter table war_room_messages      enable row level security;
alter table war_room_reactions     enable row level security;
alter table battle_cries           enable row level security;
alter table ambassadors            enable row level security;
alter table referral_events        enable row level security;
alter table ambassador_compensation enable row level security;
alter table demand_events          enable row level security;

create policy "war room read" on war_room_messages for select
  using (exists (select 1 from challenge_participants cp
    where cp.challenge_id = war_room_messages.challenge_id
      and cp.user_id = auth.uid() and cp.chosen_bar_id = war_room_messages.bar_id
      and cp.was_checked_in = true));

create policy "own ambassador"  on ambassadors for select using (auth.uid() = user_id);
create policy "own referrals"   on referral_events for select using (
  referrer_id = (select id from ambassadors where user_id = auth.uid()));
create policy "own compensation" on ambassador_compensation for select using (
  ambassador_id = (select id from ambassadors where user_id = auth.uid()));

create policy "public demand"   on demand_events for select using (true);
create policy "public cries"    on battle_cries for select using (true);
create policy "public reactions" on war_room_reactions for select using (true);