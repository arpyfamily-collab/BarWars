-- BarWars Migration 005
-- War Room chat, Ambassador program, Bar onboarding, Demand signals

-- ─── WAR ROOM ────────────────────────────────────────────────────────────────
-- In-venue team chat visible only to checked-in fighters on the same side.
-- Messages are append-only. Moderated via keyword filter + 1-tap report.

create table war_room_messages (
  id              uuid primary key default uuid_generate_v4(),
  challenge_id    uuid not null references bar_challenges(id) on delete cascade,
  bar_id          uuid not null references venues(id),          -- which side's room
  user_id         uuid not null references auth.users(id),
  display_name    text not null,                                 -- cached at send time
  body            text not null check (char_length(body) <= 280),
  flagged         boolean not null default false,
  deleted         boolean not null default false,               -- soft delete by operator
  created_at      timestamptz not null default now()
);

create index war_room_challenge_bar_idx on war_room_messages(challenge_id, bar_id, created_at);
create index war_room_flagged_idx       on war_room_messages(flagged) where flagged = true;

create table war_room_reactions (
  id           uuid primary key default uuid_generate_v4(),
  message_id   uuid not null references war_room_messages(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  emoji        text not null check (emoji in ('🔥','💪','⚡','👀','😤')),
  created_at   timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

-- Battle cry: a single pinned team message, 60 chars max, set by top fighter
create table battle_cries (
  id           uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references bar_challenges(id) on delete cascade,
  bar_id       uuid not null references venues(id),
  user_id      uuid not null references auth.users(id),
  cry          text not null check (char_length(cry) <= 60),
  set_at       timestamptz not null default now(),
  unique (challenge_id, bar_id)               -- one active cry per bar per challenge
);

-- ─── AMBASSADOR PROGRAM ──────────────────────────────────────────────────────

create type ambassador_tier as enum ('scout', 'soldier', 'captain', 'general');

create table ambassadors (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  referral_code       text not null unique default upper(substr(md5(random()::text), 1, 8)),

  -- Tier tracking
  tier                ambassador_tier not null default 'scout',
  lifetime_referrals  int not null default 0,    -- direct (L1) referrals who bought a pass
  lifetime_l2_referrals int not null default 0,  -- L2 referrals (friends of friends)
  lifetime_revenue    int not null default 0,    -- cents attributed to this ambassador

  -- Current balance
  credit_balance_cents int not null default 0,
  passes_earned        int not null default 0,

  -- Optional greek life affiliation
  chapter_name        text,
  chapter_code        text,                      -- e.g. 'KAPPA-DELTA'

  created_at          timestamptz not null default now()
);

create index ambassadors_code_idx    on ambassadors(referral_code);
create index ambassadors_chapter_idx on ambassadors(chapter_code) where chapter_code is not null;

-- Referral attribution — who referred whom, at what level
create table referral_events (
  id                      uuid primary key default uuid_generate_v4(),
  referrer_id             uuid not null references ambassadors(id),
  referred_user_id        uuid not null references auth.users(id),
  level                   int not null check (level in (1, 2)),  -- max 2 levels
  pass_id                 uuid references passes(id),            -- the purchase that triggered this
  revenue_cents           int not null default 0,
  commission_cents        int not null default 0,                -- ambassador's cut
  bar_id                  uuid references venues(id),
  created_at              timestamptz not null default now(),
  unique (referrer_id, referred_user_id, pass_id)
);

create index referral_referrer_idx on referral_events(referrer_id);
create index referral_bar_idx      on referral_events(bar_id);

-- Bar compensation events (what the bar owes/has paid to ambassadors)
create table ambassador_compensation (
  id               uuid primary key default uuid_generate_v4(),
  ambassador_id    uuid not null references ambassadors(id),
  bar_id           uuid not null references venues(id),
  type             text not null check (type in ('pass_credit','drink_credit','cash','upgrade')),
  amount_cents     int not null default 0,
  description      text,
  issued_at        timestamptz not null default now(),
  redeemed         boolean not null default false,
  redeemed_at      timestamptz
);

-- Greek chapter leaderboard (computed view)
create or replace view chapter_leaderboard as
  select
    a.chapter_code,
    a.chapter_name,
    count(distinct a.id)                               as member_count,
    sum(a.lifetime_referrals + a.lifetime_l2_referrals) as total_referrals,
    sum(a.lifetime_revenue)                            as total_revenue_cents,
    max(a.tier)                                        as top_tier
  from ambassadors a
  where a.chapter_code is not null
  group by a.chapter_code, a.chapter_name
  order by total_referrals desc;

-- ─── TIER THRESHOLDS ─────────────────────────────────────────────────────────
-- Scout:   0–4 L1 referrals     → 5% commission, $1 credit per referral
-- Soldier: 5–14 L1 referrals    → 8% commission, $2 credit + 1 free pass/month
-- Captain: 15–29 L1 referrals   → 12% commission, $5 credit + 2 free passes/month
-- General: 30+ L1 referrals     → 15% commission + drink credit + priority entry

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

-- L1 commission rates by tier (basis points, so 500 = 5%)
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

-- ─── DEMAND EVENTS ───────────────────────────────────────────────────────────
-- Stores game data fetched from CollegeFootballData API.
-- The demand_score (0–100) drives pre-band pricing and ambassador incentives.

create table demand_events (
  id                uuid primary key default uuid_generate_v4(),
  event_date        date not null,
  venue_id          uuid not null references venues(id),

  -- CFBD data
  home_team         text,
  away_team         text,
  home_record       text,          -- e.g. '8-1'
  away_record       text,
  home_rank         int,           -- AP ranking, null if unranked
  away_rank         int,
  spread            numeric(5,1),  -- betting line (negative = home favored)
  total             numeric(5,1),  -- over/under
  game_time         text,          -- '6:00 PM CT'
  is_rivalry        boolean not null default false,
  is_conference     boolean not null default false,
  neutral_site      boolean not null default false,

  -- Resale signal (fetched from StubHub/SeatGeek if available)
  resale_avg_cents  int,           -- average resale ticket price
  resale_volume     int,           -- number of listings

  -- Computed output
  demand_score      int not null default 50 check (demand_score between 0 and 100),
  recommended_tier  text not null default 'standard',   -- 'slow'|'standard'|'marquee'
  price_multiplier  numeric(4,2) not null default 1.0,  -- apply to base prices

  -- Pre-band recommendations
  recommended_release_days_out int not null default 3,
  recommended_pass_limit       int,          -- cap total passes for this event
  ambassador_incentive_boost   int not null default 0,  -- extra % commission on hot nights

  fetched_at        timestamptz not null default now(),
  unique (event_date, venue_id)
);

create index demand_date_idx on demand_events(event_date);

-- ─── BAR ONBOARDING ──────────────────────────────────────────────────────────

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
  monthly_revenue_band text,    -- '$0-25k' | '$25-50k' | '$50k+'
  referral_source   text,
  notes             text,
  status            bar_status not null default 'applied',
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  venue_id          uuid references venues(id),  -- set when approved + created
  created_at        timestamptz not null default now()
);

alter table bar_applications enable row level security;

create policy "own application"
  on bar_applications for select
  using (contact_email = (select email from auth.users where id = auth.uid()));

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table war_room_messages      enable row level security;
alter table war_room_reactions     enable row level security;
alter table battle_cries           enable row level security;
alter table ambassadors            enable row level security;
alter table referral_events        enable row level security;
alter table ambassador_compensation enable row level security;
alter table demand_events          enable row level security;

-- War room: only checked-in participants on the same side can read
create policy "war room read"
  on war_room_messages for select
  using (
    exists (
      select 1 from challenge_participants cp
      where cp.challenge_id = war_room_messages.challenge_id
        and cp.user_id      = auth.uid()
        and cp.chosen_bar_id = war_room_messages.bar_id
        and cp.was_checked_in = true
    )
  );

-- Ambassadors: own record
create policy "own ambassador"  on ambassadors for select using (auth.uid() = user_id);
create policy "own referrals"   on referral_events for select using (
  referrer_id = (select id from ambassadors where user_id = auth.uid())
);
create policy "own compensation" on ambassador_compensation for select using (
  ambassador_id = (select id from ambassadors where user_id = auth.uid())
);

-- Demand events: public read (bars and students both see the score)
create policy "public demand"   on demand_events for select using (true);

-- Battle cries: public read within the challenge
create policy "public cries"    on battle_cries for select using (true);
create policy "public reactions" on war_room_reactions for select using (true);
