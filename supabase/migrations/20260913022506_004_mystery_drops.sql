-- BarWars Migration 004 — Mystery Drops
-- Daily limited-pass drops with a virtual waiting room.

create type drop_status as enum (
  'scheduled', 'queue_open', 'live', 'sold_out', 'completed', 'cancelled'
);

create table mystery_drops (
  id                    uuid primary key default uuid_generate_v4(),
  venue_id              uuid not null references venues(id) on delete cascade,
  event_id              uuid references events(id),
  status                drop_status not null default 'scheduled',
  queue_opens_at        timestamptz not null,
  drop_at               timestamptz not null,
  expires_at            timestamptz not null,
  pass_distribution     jsonb not null,
  total_passes          int not null default 10,
  passes_claimed        int not null default 0,
  discount_percent      int not null default 50,
  original_price_cents  int not null,
  teaser_text           text,
  is_surprise           boolean not null default false,
  guess_reward_cents    int not null default 100,
  created_at            timestamptz not null default now(),
  constraint drop_window_valid check (expires_at > drop_at),
  constraint drop_queue_before_drop check (drop_at > queue_opens_at),
  constraint total_passes_positive check (total_passes > 0 AND total_passes <= 50)
);

create index drops_venue_status_idx  on mystery_drops(venue_id, status);

create table drop_queue_entries (
  id              uuid primary key default uuid_generate_v4(),
  drop_id         uuid not null references mystery_drops(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  queue_position  int,
  eligible        boolean not null default false,
  pass_type       text,
  claimed         boolean not null default false,
  claimed_at      timestamptz,
  pass_id         uuid references passes(id),
  joined_at       timestamptz not null default now(),
  unique (drop_id, user_id)
);

create index queue_drop_idx on drop_queue_entries(drop_id);

create table drop_guesses (
  id                    uuid primary key default uuid_generate_v4(),
  drop_id               uuid not null references mystery_drops(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  guessed_distribution  jsonb not null,
  was_correct           boolean,
  credit_awarded_cents  int not null default 0,
  created_at            timestamptz not null default now(),
  unique (drop_id, user_id)
);

create or replace function randomize_drop_queue(p_drop_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_drop mystery_drops; v_dist jsonb; v_total int; v_entry record;
  v_pass_types text[]; v_type text;
begin
  select * into v_drop from mystery_drops where id = p_drop_id and status = 'queue_open' for update;
  if not found then return jsonb_build_object('error', 'Drop not in queue_open status'); end if;
  v_dist := v_drop.pass_distribution; v_total := v_drop.total_passes;
  select array_agg(pt order by random()) into v_pass_types
  from (select key as pt, generate_series(1, (value::text)::int) as n from jsonb_each(v_dist)) sub;
  update drop_queue_entries set queue_position = sub.rn
  from (select id, row_number() over (order by random()) as rn from drop_queue_entries where drop_id = p_drop_id) sub
  where drop_queue_entries.id = sub.id;
  for v_entry in select id, queue_position from drop_queue_entries
    where drop_id = p_drop_id and queue_position <= v_total order by queue_position
  loop
    v_type := v_pass_types[v_entry.queue_position];
    update drop_queue_entries set eligible = true, pass_type = v_type where id = v_entry.id;
  end loop;
  update mystery_drops set status = 'live' where id = p_drop_id;
  return jsonb_build_object('eligible_count', v_total,
    'total_in_queue', (select count(*) from drop_queue_entries where drop_id = p_drop_id));
end;
$$;

create or replace function claim_drop_pass(p_drop_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_entry drop_queue_entries; v_drop mystery_drops; v_price int;
  v_pass_id uuid; v_token uuid; v_reserved boolean;
begin
  select * into v_entry from drop_queue_entries
  where drop_id = p_drop_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('error', 'Not in queue'); end if;
  if not v_entry.eligible then return jsonb_build_object('error', 'Not eligible'); end if;
  if v_entry.claimed then return jsonb_build_object('error', 'Already claimed'); end if;
  select * into v_drop from mystery_drops where id = p_drop_id for update;
  if v_drop.status not in ('live', 'queue_open') then
    return jsonb_build_object('error', 'Drop is not live');
  end if;
  if v_drop.expires_at < now() then
    return jsonb_build_object('error', 'Drop has expired');
  end if;
  v_price := round(v_drop.original_price_cents * (1 - v_drop.discount_percent::numeric / 100));
  if v_drop.event_id is not null then
    select reserve_pass(v_drop.event_id, v_entry.pass_type) into v_reserved;
    if not v_reserved then return jsonb_build_object('error', 'Room sold out'); end if;
  end if;
  v_token := gen_random_uuid();
  insert into passes (event_id, user_id, pass_type, status, qr_token, amount_paid)
  values (v_drop.event_id, p_user_id, v_entry.pass_type::pass_type, 'active', v_token, v_price)
  returning id into v_pass_id;
  update drop_queue_entries set claimed = true, claimed_at = now(), pass_id = v_pass_id where id = v_entry.id;
  update mystery_drops set passes_claimed = passes_claimed + 1,
    status = case when passes_claimed + 1 >= total_passes then 'sold_out' else status end
  where id = p_drop_id;
  return jsonb_build_object('pass_id', v_pass_id, 'pass_type', v_entry.pass_type,
    'qr_token', v_token, 'price_paid', v_price);
end;
$$;

alter table mystery_drops       enable row level security;
alter table drop_queue_entries  enable row level security;
alter table drop_guesses        enable row level security;

create policy "public read drops" on mystery_drops for select using (status != 'cancelled');
create policy "own queue entry" on drop_queue_entries for select using (auth.uid() = user_id);
create policy "own guess" on drop_guesses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);