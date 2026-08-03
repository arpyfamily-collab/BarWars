-- BarWars Migration 004 — Mystery Drops
-- Daily limited-pass drops with a virtual waiting room.
-- 10 passes per drop, queue randomized at drop time — not a speed race.

create type drop_status as enum (
  'scheduled',    -- created, not yet open for queue entry
  'queue_open',   -- waiting room open, users can join
  'live',         -- queue randomized, passes being claimed
  'sold_out',     -- all passes claimed
  'completed',    -- drop window closed (some unclaimed passes expired)
  'cancelled'
);

-- ─── MYSTERY DROPS ────────────────────────────────────────────────────────────

create table mystery_drops (
  id                    uuid primary key default uuid_generate_v4(),
  venue_id              uuid not null references venues(id) on delete cascade,
  event_id              uuid references events(id),          -- links to tonight's event

  status                drop_status not null default 'scheduled',

  -- Timing
  queue_opens_at        timestamptz not null,                -- waiting room opens
  drop_at               timestamptz not null,                -- queue randomizes + passes release
  expires_at            timestamptz not null,                -- unclaimed passes void after this

  -- Pass distribution (how the 10 passes are split)
  -- e.g. { full_venue: 4, music_hall: 3, bull_patio: 2, sports_lounge: 1 }
  pass_distribution     jsonb not null,
  total_passes          int not null default 10,
  passes_claimed        int not null default 0,

  -- Pricing
  discount_percent      int not null default 50,             -- 50% off base price
  original_price_cents  int not null,                        -- full venue base price for reference

  -- Announcement copy (optional — blank = surprise drop)
  teaser_text           text,                                -- shown before queue opens
  is_surprise           boolean not null default false,      -- if true, don't show time until queue opens

  -- Guess game
  guess_reward_cents    int not null default 100,            -- $1 credit for correct guess

  created_at            timestamptz not null default now(),

  constraint drop_window_valid check (expires_at > drop_at),
  constraint drop_queue_before_drop check (drop_at > queue_opens_at),
  constraint total_passes_positive check (total_passes > 0 AND total_passes <= 50)
);

create index drops_venue_status_idx  on mystery_drops(venue_id, status);
create index drops_drop_at_idx       on mystery_drops(drop_at) where status in ('scheduled','queue_open');

-- ─── QUEUE ENTRIES ────────────────────────────────────────────────────────────

create table drop_queue_entries (
  id              uuid primary key default uuid_generate_v4(),
  drop_id         uuid not null references mystery_drops(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,

  queue_position  int,                   -- null until drop goes live and queue is randomized
  eligible        boolean not null default false,  -- true if position <= total_passes
  pass_type       text,                  -- assigned pass type once eligible (from distribution)

  claimed         boolean not null default false,
  claimed_at      timestamptz,
  pass_id         uuid references passes(id),      -- the actual pass created on claim

  joined_at       timestamptz not null default now(),

  unique (drop_id, user_id)              -- one entry per user per drop
);

create index queue_drop_idx      on drop_queue_entries(drop_id);
create index queue_eligible_idx  on drop_queue_entries(drop_id, eligible, claimed)
  where eligible = true and claimed = false;

-- ─── DROP GUESSES ─────────────────────────────────────────────────────────────

create table drop_guesses (
  id                    uuid primary key default uuid_generate_v4(),
  drop_id               uuid not null references mystery_drops(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  guessed_distribution  jsonb not null,  -- { full_venue: 4, music_hall: 3, ... }
  was_correct           boolean,         -- set when drop resolves
  credit_awarded_cents  int not null default 0,
  created_at            timestamptz not null default now(),
  unique (drop_id, user_id)
);

-- ─── RANDOMIZE QUEUE RPC ──────────────────────────────────────────────────────
-- Called at drop_at by the mystery-drop edge function.
-- Assigns random queue positions and marks eligible entries.
-- Also distributes pass types across eligible entries.

create or replace function randomize_drop_queue(p_drop_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_drop        mystery_drops;
  v_dist        jsonb;
  v_total       int;
  v_pos         int := 1;
  v_entry       record;
  v_pass_types  text[];
  v_type        text;
begin
  select * into v_drop
  from mystery_drops
  where id = p_drop_id and status = 'queue_open'
  for update;

  if not found then
    return jsonb_build_object('error', 'Drop not in queue_open status');
  end if;

  v_dist  := v_drop.pass_distribution;
  v_total := v_drop.total_passes;

  -- Build ordered list of pass types from distribution
  -- e.g. { full_venue: 3, music_hall: 3, bull_patio: 2, sports_lounge: 2 }
  -- → [full_venue, full_venue, full_venue, music_hall, ...]
  select array_agg(pt order by random())
  into v_pass_types
  from (
    select key as pt, generate_series(1, (value::text)::int) as n
    from jsonb_each(v_dist)
  ) sub;

  -- Assign random positions to all queue entries
  update drop_queue_entries
  set queue_position = sub.rn
  from (
    select id, row_number() over (order by random()) as rn
    from drop_queue_entries
    where drop_id = p_drop_id
  ) sub
  where drop_queue_entries.id = sub.id;

  -- Mark eligible entries (position <= total_passes) and assign pass types
  for v_entry in
    select id, queue_position
    from drop_queue_entries
    where drop_id = p_drop_id
      and queue_position <= v_total
    order by queue_position
  loop
    v_type := v_pass_types[v_entry.queue_position];
    update drop_queue_entries
    set eligible  = true,
        pass_type = v_type
    where id = v_entry.id;
  end loop;

  -- Flip drop status to live
  update mystery_drops
  set status = 'live'
  where id = p_drop_id;

  return jsonb_build_object(
    'eligible_count', v_total,
    'total_in_queue', (select count(*) from drop_queue_entries where drop_id = p_drop_id)
  );
end;
$$;

-- ─── ATOMIC CLAIM RPC ─────────────────────────────────────────────────────────
-- Called when an eligible user claims their pass.
-- Atomically checks eligibility, creates the pass, marks entry claimed.

create or replace function claim_drop_pass(p_drop_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_entry   drop_queue_entries;
  v_drop    mystery_drops;
  v_event   events;
  v_price   int;
  v_pass_id uuid;
  v_token   uuid;
begin
  -- Lock the queue entry
  select * into v_entry
  from drop_queue_entries
  where drop_id = p_drop_id and user_id = p_user_id
  for update;

  if not found          then return jsonb_build_object('error', 'Not in queue'); end if;
  if not v_entry.eligible then return jsonb_build_object('error', 'Not eligible'); end if;
  if v_entry.claimed      then return jsonb_build_object('error', 'Already claimed'); end if;

  select * into v_drop from mystery_drops where id = p_drop_id for update;
  if v_drop.status not in ('live', 'queue_open') then
    return jsonb_build_object('error', 'Drop is not live');
  end if;
  if new_value.expires_at < now() then
    return jsonb_build_object('error', 'Drop has expired');
  end if;

  -- Calculate discounted price
  v_price := round(v_drop.original_price_cents * (1 - v_drop.discount_percent::numeric / 100));

  -- Use reserve_pass RPC (from migration 001) for capacity enforcement
  if v_drop.event_id is not null then
    declare v_reserved boolean;
    begin
      select reserve_pass(v_drop.event_id, v_entry.pass_type) into v_reserved;
      if not v_reserved then
        return jsonb_build_object('error', 'Room sold out');
      end if;
    end;
  end if;

  -- Generate pass token
  v_token := gen_random_uuid();

  -- Create the pass
  insert into passes (event_id, user_id, pass_type, status, qr_token, amount_paid)
  values (v_drop.event_id, p_user_id, v_entry.pass_type::pass_type, 'active', v_token, v_price)
  returning id into v_pass_id;

  -- Mark queue entry as claimed
  update drop_queue_entries
  set claimed = true, claimed_at = now(), pass_id = v_pass_id
  where id = v_entry.id;

  -- Increment drop claimed count; flip to sold_out if fully claimed
  update mystery_drops
  set passes_claimed = passes_claimed + 1,
      status = case when passes_claimed + 1 >= total_passes then 'sold_out' else status end
  where id = p_drop_id;

  return jsonb_build_object(
    'pass_id',    v_pass_id,
    'pass_type',  v_entry.pass_type,
    'qr_token',   v_token,
    'price_paid', v_price
  );
end;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table mystery_drops       enable row level security;
alter table drop_queue_entries  enable row level security;
alter table drop_guesses        enable row level security;

-- Public can read non-cancelled drops
create policy "public read drops"
  on mystery_drops for select
  using (status != 'cancelled');

-- Own queue entry
create policy "own queue entry"
  on drop_queue_entries for select
  using (auth.uid() = user_id);

-- Own guess
create policy "own guess"
  on drop_guesses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
