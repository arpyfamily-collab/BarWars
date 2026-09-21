-- BarWars Migration 003
-- bar_admins: maps users to the bar they administer
-- user_push_tokens: FCM tokens for push notifications

-- ─── BAR ADMINS ───────────────────────────────────────────────────────────────

create table bar_admins (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  bar_id     uuid not null references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, bar_id)
);

alter table bar_admins enable row level security;

create policy "own bar admin record"
  on bar_admins for select
  using (auth.uid() = user_id);

create policy "operator read bar admins"
  on bar_admins for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_staff = true
    )
  );

create index bar_admins_user_idx on bar_admins(user_id);
create index bar_admins_bar_idx  on bar_admins(bar_id);

-- ─── USER PUSH TOKENS ─────────────────────────────────────────────────────────

create table user_push_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fcm_token   text not null,
  platform    text not null default 'web',
  updated_at  timestamptz not null default now(),
  unique (user_id, platform)
);

alter table user_push_tokens enable row level security;

create policy "own push tokens"
  on user_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index push_tokens_user_idx on user_push_tokens(user_id);