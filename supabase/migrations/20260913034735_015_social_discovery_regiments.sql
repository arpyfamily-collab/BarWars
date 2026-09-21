/*
# Turf Wars Phase 6 — The Social Discovery Layer: "Find Your Regiment"

## Overview
Solves the social infrastructure problem for unaffiliated students. A transfer
student or lonely freshman can discover compatible peers through a lightweight
matchmaking flow, form Regiments (friend groups), and naturally feed into the
Hessian Company pipeline or participate as Allies.

Also adds Regiment Raids — Greek orgs can post open invitations for
unaffiliated students to attend a specific bar event as Allies during rush.

## New Tables

### regiment_finder_profiles
Onboarding answers for unaffiliated users seeking their people.
- id, user_id (uuid, the student)
- nights_out: 'mon_thu' | 'fri_sat' | 'both'
- vibe: 'trivia' | 'live_music' | 'just_vibing' | 'wherever' | 'in_the_action'
- situation: 'new_to_town' | 'transfer' | 'no_crew' | 'friends_graduated'
- pitch: text (free-text "what do you bring to the table?")
- is_looking: boolean (default true — set false when they find a regiment)
- created_at, updated_at

### regiment_links
Mutual "Link Up" connections between two users. Both must consent.
- id, user_a (uuid), user_b (uuid)
- status: 'pending' | 'linked' | 'declined'
- initiator (uuid — who sent the request)
- created_at, linked_at

### regiments
A formed group of 5+ mutually-linked students.
- id, name (text — the Regiment's chosen name)
- captain_id (uuid — who proposed formation)
- member_count (int, denormalized)
- converted_to_hessian (boolean, default false — tracks if they became a Hessian Company)
- hessian_company_id (uuid, nullable — links to hessian_companies if converted)
- created_at

### regiment_members
Members of a Regiment.
- id, regiment_id, user_id
- role: 'captain' | 'member'
- joined_at

### regiment_raids
Open invitations from Greek orgs for unaffiliated students to attend a bar
event as Allies during rush periods.
- id, org_id (the Greek org posting the raid)
- bar_id (the venue)
- event_date (date of the raid event)
- window_open_at, window_close_at (the check-in window)
- pitch (text — the org's invitation message)
- max_allies (int, nullable — cap on attendees)
- status: 'open' | 'closed' | 'completed'
- created_at

## Security
- regiment_finder_profiles: authenticated CRUD, user owns their own profile
- regiment_links: authenticated, users can read their own links, insert as initiator,
  update status only for links where they are the recipient
- regiments: public read, captain insert, captain update
- regiment_members: public read, captain insert, self insert (joining accepted regiment)
- regiment_raids: public read, org member insert, org member update
*/

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

do $$ begin
  create type nights_out_pref as enum ('mon_thu', 'fri_sat', 'both');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type social_vibe as enum ('trivia', 'live_music', 'just_vibing', 'wherever', 'in_the_action');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type social_situation as enum ('new_to_town', 'transfer', 'no_crew', 'friends_graduated');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type link_status as enum ('pending', 'linked', 'declined');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type raid_status as enum ('open', 'closed', 'completed');
exception when duplicate_object then null;
end $$;

-- ─── REGIMENT FINDER PROFILES ─────────────────────────────────────────────────

create table if not exists regiment_finder_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  nights_out   nights_out_pref not null,
  vibe         social_vibe not null,
  situation    social_situation not null,
  pitch        text not null default '',
  is_looking   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists regiment_finder_looking_idx on regiment_finder_profiles(is_looking) where is_looking = true;
create index if not exists regiment_finder_vibe_idx on regiment_finder_profiles(vibe);
create index if not exists regiment_finder_nights_idx on regiment_finder_profiles(nights_out);

-- ─── REGIMENT LINKS ───────────────────────────────────────────────────────────

create table if not exists regiment_links (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users(id) on delete cascade,
  user_b      uuid not null references auth.users(id) on delete cascade,
  status      link_status not null default 'pending',
  initiator   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  linked_at   timestamptz,
  constraint regiment_links_distinct_users check (user_a <> user_b),
  constraint regiment_links_unique unique (user_a, user_b)
);

create index if not exists regiment_links_user_a_idx on regiment_links(user_a);
create index if not exists regiment_links_user_b_idx on regiment_links(user_b);
create index if not exists regiment_links_status_idx on regiment_links(status);

-- ─── REGIMENTS ────────────────────────────────────────────────────────────────

create table if not exists regiments (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  captain_id             uuid not null references auth.users(id) on delete cascade,
  member_count           int not null default 1,
  converted_to_hessian   boolean not null default false,
  hessian_company_id     uuid references hessian_companies(id) on delete set null,
  created_at             timestamptz not null default now()
);

create index if not exists regiments_captain_idx on regiments(captain_id);

-- ─── REGIMENT MEMBERS ─────────────────────────────────────────────────────────

create table if not exists regiment_members (
  id           uuid primary key default gen_random_uuid(),
  regiment_id  uuid not null references regiments(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         hessian_member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (regiment_id, user_id)
);

create index if not exists regiment_members_regiment_idx on regiment_members(regiment_id);
create index if not exists regiment_members_user_idx on regiment_members(user_id);

-- ─── REGIMENT RAIDS ───────────────────────────────────────────────────────────

create table if not exists regiment_raids (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references greek_orgs(id) on delete cascade,
  bar_id           uuid not null references venues(id) on delete cascade,
  event_date       date not null,
  window_open_at   timestamptz not null,
  window_close_at  timestamptz not null,
  pitch            text not null default '',
  max_allies       int,
  status           raid_status not null default 'open',
  created_at       timestamptz not null default now(),
  constraint regiment_raid_window_valid check (window_close_at > window_open_at)
);

create index if not exists regiment_raids_open_idx on regiment_raids(status) where status = 'open';
create index if not exists regiment_raids_org_idx on regiment_raids(org_id);
create index if not exists regiment_raids_date_idx on regiment_raids(event_date);

-- ─── RLS ───────────────────────────────────────────────────────────────────────

alter table regiment_finder_profiles enable row level security;
alter table regiment_links          enable row level security;
alter table regiments               enable row level security;
alter table regiment_members        enable row level security;
alter table regiment_raids          enable row level security;

-- regiment_finder_profiles: user owns their profile, can read others for matching
drop policy if exists "read all finder profiles" on regiment_finder_profiles;
create policy "read all finder profiles" on regiment_finder_profiles
  for select to authenticated using (true);

drop policy if exists "insert own finder profile" on regiment_finder_profiles;
create policy "insert own finder profile" on regiment_finder_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own finder profile" on regiment_finder_profiles;
create policy "update own finder profile" on regiment_finder_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- regiment_links: read own links, insert as initiator, update as recipient
drop policy if exists "read own links" on regiment_links;
create policy "read own links" on regiment_links
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists "initiate link" on regiment_links;
create policy "initiate link" on regiment_links
  for insert to authenticated
  with check (initiator = auth.uid() and (user_a = auth.uid() or user_b = auth.uid()));

drop policy if exists "respond to link" on regiment_links;
create policy "respond to link" on regiment_links
  for update to authenticated
  using (user_a = auth.uid() or user_b = auth.uid())
  with check (user_a = auth.uid() or user_b = auth.uid());

-- regiments: public read, captain insert, captain update
drop policy if exists "public read regiments" on regiments;
create policy "public read regiments" on regiments
  for select to anon, authenticated using (true);

drop policy if exists "captain insert regiment" on regiments;
create policy "captain insert regiment" on regiments
  for insert to authenticated
  with check (captain_id = auth.uid());

drop policy if exists "captain update regiment" on regiments;
create policy "captain update regiment" on regiments
  for update to authenticated
  using (captain_id = auth.uid())
  with check (captain_id = auth.uid());

-- regiment_members: public read, captain insert, self insert
drop policy if exists "public read regiment_members" on regiment_members;
create policy "public read regiment_members" on regiment_members
  for select to anon, authenticated using (true);

drop policy if exists "captain insert regiment_members" on regiment_members;
create policy "captain insert regiment_members" on regiment_members
  for insert to authenticated
  with check (
    exists (select 1 from regiments r where r.id = regiment_members.regiment_id and r.captain_id = auth.uid())
    or regiment_members.user_id = auth.uid()
  );

drop policy if exists "captain update regiment_members" on regiment_members;
create policy "captain update regiment_members" on regiment_members
  for update to authenticated
  using (
    exists (select 1 from regiments r where r.id = regiment_members.regiment_id and r.captain_id = auth.uid())
  )
  with check (
    exists (select 1 from regiments r where r.id = regiment_members.regiment_id and r.captain_id = auth.uid())
  );

-- regiment_raids: public read, org member insert/update
drop policy if exists "public read regiment_raids" on regiment_raids;
create policy "public read regiment_raids" on regiment_raids
  for select to anon, authenticated using (true);

drop policy if exists "org member insert raid" on regiment_raids;
create policy "org member insert raid" on regiment_raids
  for insert to authenticated
  with check (
    exists (select 1 from org_memberships m
      where m.org_id = regiment_raids.org_id
        and m.user_id = auth.uid() and m.verified = true)
  );

drop policy if exists "org member update raid" on regiment_raids;
create policy "org member update raid" on regiment_raids
  for update to authenticated
  using (
    exists (select 1 from org_memberships m
      where m.org_id = regiment_raids.org_id
        and m.user_id = auth.uid() and m.verified = true)
  )
  with check (
    exists (select 1 from org_memberships m
      where m.org_id = regiment_raids.org_id
        and m.user_id = auth.uid() and m.verified = true)
  );