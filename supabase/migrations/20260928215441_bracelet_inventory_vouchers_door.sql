-- Bracelet inventory, vouchers and Door Mode (Brian, Sep 28). The app handles redemption.
--   printed tags (staff) → received (bar scans each band in) → hidden (bar scans the band, sets clues,
--   offer and the night(s) it's good for) → found (player scans; it becomes a voucher in their app)
--   → redeemed (door staff scan the player's voucher, whose code changes every 30 seconds).
-- A bracelet is good for the night(s) the bar picks (default one), so unused ones get donated to the
-- Armory and each night reconciles: bands out vs. bands redeemed.

alter table public.bracelet_drops
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.profiles(id) on delete set null,
  add column if not exists valid_night date,
  add column if not exists valid_nights smallint not null default 1 check (valid_nights between 1 and 7),
  add column if not exists holder_id uuid references public.profiles(id) on delete set null,
  add column if not exists transfers smallint not null default 0,
  add column if not exists redeemed_at timestamptz,
  add column if not exists redeemed_by uuid references public.profiles(id) on delete set null,
  add column if not exists voucher_secret text not null default md5(random()::text || clock_timestamp()::text);
update public.bracelet_drops set holder_id = found_by where holder_id is null and status = 'kept';
update public.bracelet_drops b set holder_id = a.claimed_by, transfers = 1 from public.armory a
 where a.bracelet_id = b.id and a.status = 'claimed' and b.holder_id is null;

-- Bars can no longer create bracelets out of thin air; hiding goes through hide_bracelet()
drop policy if exists "bar admins hide bracelets" on public.bracelet_drops;

-- Door staff: scan-only accounts a bar adds by invite (separate from managers)
create table if not exists public.bar_door_staff (
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  invite_id uuid references public.bar_staff_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (user_id, venue_id)
);
alter table public.bar_door_staff enable row level security;
alter table public.bar_staff_invites add column if not exists kind text not null default 'staff_spy' check (kind in ('staff_spy', 'door'));

create or replace function public.can_work_door(p_user uuid, p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bar_admin(p_user, p_venue)
      or exists (select 1 from public.bar_door_staff where user_id = p_user and venue_id = p_venue and removed_at is null);
$$;

-- Invites: staff spies count toward 3 per semester; door staff invites don't
create or replace function public.create_staff_invite(p_user uuid, p_venue uuid, p_name text, p_token text, p_kind text default 'staff_spy')
returns json language plpgsql security definer set search_path = public as $$
declare n int; inv uuid;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  if p_kind not in ('staff_spy', 'door') then raise exception 'BAD_KIND'; end if;
  perform 1 from public.venues where id = p_venue for update;
  select count(*) into n from public.bar_staff_invites
   where venue_id = p_venue and kind = 'staff_spy' and created_at >= public.semester_start() and revoked_at is null
     and (used_at is not null or expires_at > now());
  if p_kind = 'staff_spy' and n >= 3 then raise exception 'INVITE_CAP'; end if;
  insert into public.bar_staff_invites (venue_id, created_by, employee_name, token_hash, kind)
  values (p_venue, p_user, btrim(p_name), md5(p_token), p_kind) returning id into inv;
  return json_build_object('id', inv, 'left', case when p_kind = 'staff_spy' then 2 - n else null end);
end $$;
drop function if exists public.create_staff_invite(uuid, uuid, text, text);

create or replace function public.claim_staff_invite(p_user uuid, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.bar_staff_invites where token_hash = md5(p_token) for update;
  if not found or i.revoked_at is not null or i.used_at is not null or i.expires_at <= now() then raise exception 'INVITE_INVALID'; end if;
  if not exists (select 1 from public.profiles where id = p_user and age_verified) then raise exception 'AGE_REQUIRED'; end if;
  if i.kind = 'door' then
    update public.bar_staff_invites set used_by = p_user, used_at = now() where id = i.id;
    insert into public.bar_door_staff (user_id, venue_id, invite_id) values (p_user, i.venue_id, i.id)
    on conflict (user_id, venue_id) do update set removed_at = null, invite_id = excluded.invite_id;
    return json_build_object('ok', true, 'kind', 'door', 'venue_id', i.venue_id);
  end if;
  if exists (select 1 from public.bar_sponsored_accounts where user_id = p_user) then raise exception 'ALREADY_SPONSORED'; end if;
  update public.bar_staff_invites set used_by = p_user, used_at = now() where id = i.id;
  insert into public.bar_sponsored_accounts (user_id, venue_id, invite_id) values (p_user, i.venue_id, i.id);
  return json_build_object('ok', true, 'kind', 'staff_spy');
end $$;

create or replace function public.revoke_staff_invite(p_user uuid, p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.bar_staff_invites where id = p_invite;
  if not found or not public.is_bar_admin(p_user, i.venue_id) then raise exception 'NOT_BAR_ADMIN'; end if;
  update public.bar_staff_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
  update public.bar_sponsored_accounts set revoked_at = coalesce(revoked_at, now()) where invite_id = p_invite;
  update public.bar_door_staff set removed_at = coalesce(removed_at, now()) where invite_id = p_invite;
end $$;

-- Is a bracelet good tonight? (null night = older bracelets, no night limit)
create or replace function public.bracelet_valid_tonight(p_night date, p_nights smallint)
returns boolean language sql stable as $$
  select p_night is null or public.bar_night() between p_night and p_night + (p_nights - 1);
$$;

-- Staff print tags for a bar: creates that many bands in stock and returns their codes
create or replace function public.print_bracelet_tags(p_staff uuid, p_venue uuid, p_count int)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_staff and is_staff) then raise exception 'STAFF_ONLY'; end if;
  if p_count < 1 or p_count > 100 then raise exception 'BAD_COUNT'; end if;
  return (with ins as (
    insert into public.bracelet_drops (venue_id, status, drop_week, offer_type)
    select p_venue, 'in_stock', date_trunc('week', now() at time zone 'America/Chicago')::date, 'no_cover' from generate_series(1, p_count)
    returning qr_token) select json_agg(qr_token) from ins);
end $$;

-- The bar scans a band in as it arrives
create or replace function public.receive_bracelet(p_user uuid, p_venue uuid, p_qr uuid)
returns json language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  select * into b from public.bracelet_drops where qr_token = p_qr for update;
  if not found then raise exception 'UNKNOWN_BAND'; end if;
  if b.venue_id <> p_venue then raise exception 'WRONG_BAR'; end if;
  if b.status <> 'in_stock' then raise exception 'ALREADY_USED_BAND'; end if;
  if b.received_at is not null then return json_build_object('already', true); end if;
  update public.bracelet_drops set received_at = now(), received_by = p_user where id = b.id;
  return json_build_object('already', false,
    'in_stock', (select count(*) from public.bracelet_drops where venue_id = p_venue and status = 'in_stock' and received_at is not null));
end $$;

-- The bar hides a received band: clues, offer, and the night(s) it's good for
create or replace function public.hide_bracelet(p_user uuid, p_venue uuid, p_qr uuid, p_clue1 text, p_clue2 text, p_clue3 text,
  p_release2 timestamptz, p_release3 timestamptz, p_offer_type text, p_offer_value text, p_night date, p_nights int)
returns json language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not public.is_bar_admin(p_user, p_venue) then raise exception 'NOT_BAR_ADMIN'; end if;
  if length(btrim(coalesce(p_clue1, ''))) = 0 then raise exception 'CLUE_REQUIRED'; end if;
  if p_offer_type not in ('no_cover', 'drink', 'other') then raise exception 'BAD_OFFER'; end if;
  if p_night is null or p_night < public.bar_night() or p_night > public.bar_night() + 30 then raise exception 'BAD_NIGHT'; end if;
  if p_nights is null or p_nights < 1 or p_nights > 7 then raise exception 'BAD_NIGHTS'; end if;
  select * into b from public.bracelet_drops where qr_token = p_qr for update;
  if not found then raise exception 'UNKNOWN_BAND'; end if;
  if b.venue_id <> p_venue then raise exception 'WRONG_BAR'; end if;
  if b.status <> 'in_stock' then raise exception 'ALREADY_USED_BAND'; end if;
  if b.received_at is null then raise exception 'NOT_RECEIVED'; end if;
  update public.bracelet_drops set status = 'hidden', hidden_at = now(), hidden_by = p_user,
    clue_1 = btrim(p_clue1), clue_2 = nullif(btrim(coalesce(p_clue2, '')), ''), clue_3 = nullif(btrim(coalesce(p_clue3, '')), ''),
    clue_1_released_at = now(), clue_2_released_at = p_release2, clue_3_released_at = p_release3,
    offer_type = p_offer_type, offer_value = nullif(btrim(coalesce(p_offer_value, '')), ''),
    valid_night = p_night, valid_nights = p_nights, drop_week = date_trunc('week', now() at time zone 'America/Chicago')::date
  where id = b.id;
  return json_build_object('ok', true);
end $$;

-- Finding: a band whose night has passed can't be found; a kept band becomes the finder's voucher
create or replace function public.bracelet_found(p_user uuid, p_qr uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; a uuid; bar text; bb record;
begin
  if p_action not in ('keep', 'donate') then raise exception 'INVALID_ACTION'; end if;
  select * into bb from public.bracelet_drops where qr_token = p_qr for update;
  if found and bb.status = 'hidden' and not public.bracelet_valid_tonight(bb.valid_night, bb.valid_nights)
     and bb.valid_night < public.bar_night() then raise exception 'EXPIRED'; end if;
  update public.bracelet_drops set status = (case when p_action = 'keep' then 'kept' else 'donated' end)::bracelet_status,
         found_by = p_user, found_at = now(), holder_id = case when p_action = 'keep' then p_user else null end
   where qr_token = p_qr and status = 'hidden'
  returning id, venue_id, offer_type, offer_value into b;
  if not found then raise exception 'ALREADY_FOUND'; end if;
  select name into bar from public.venues where id = b.venue_id;
  if p_action = 'donate' then
    insert into public.armory (bracelet_id, original_venue_id, current_venue_id, donated_by, donated_at, status)
    values (b.id, b.venue_id, b.venue_id, p_user, now(), 'available') returning id into a;
    perform public.credit_valor(p_user, 25, 'Armory donation', 'armory:' || a);
    insert into public.player_badges (user_id, badge, detail) values (p_user, 'quartermaster', 'Donated a bracelet to the Armory')
    on conflict (user_id, badge) do nothing;
  end if;
  return jsonb_build_object('id', b.id, 'status', case when p_action = 'keep' then 'kept' else 'donated' end,
    'offer_type', b.offer_type, 'offer_value', b.offer_value, 'bar_name', bar, 'armory_id', a,
    'valor_bonds', case when p_action = 'donate' then 25 else 0 end);
end $$;

-- Armory claims hand the voucher to the claimer (its one change of hands)
create or replace function public.claim_armory(p_user uuid, p_armory uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; bar text; b record;
begin
  perform pg_advisory_xact_lock(hashtext('armory_claim:' || p_user));
  if exists (select 1 from public.armory where claimed_by = p_user and claimed_at > now() - interval '7 days') then raise exception 'WEEKLY_LIMIT'; end if;
  select * into r from public.armory where id = p_armory for update;
  if not found or r.status <> 'available' then raise exception 'NOT_AVAILABLE'; end if;
  if r.donated_by = p_user then raise exception 'OWN_DONATION'; end if;
  select offer_type, offer_value, valid_night, valid_nights into b from public.bracelet_drops where id = r.bracelet_id;
  if b.valid_night is not null and b.valid_night + (b.valid_nights - 1) < public.bar_night() then raise exception 'NOT_AVAILABLE'; end if;
  update public.armory set status = 'claimed', claimed_by = p_user, claimed_at = now() where id = p_armory;
  update public.bracelet_drops set status = 'armory_claimed', holder_id = p_user, transfers = transfers + 1 where id = r.bracelet_id;
  select name into bar from public.venues where id = r.current_venue_id;
  return jsonb_build_object('id', p_armory, 'offer_type', b.offer_type, 'offer_value', b.offer_value, 'bar_name', bar);
end $$;

-- Where a voucher is honored: the Armory's current bar if it moved, else where it was hidden
create or replace function public.bracelet_home_venue(p_bracelet uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select current_venue_id from public.armory where bracelet_id = p_bracelet order by created_at desc limit 1),
                  (select venue_id from public.bracelet_drops where id = p_bracelet));
$$;

-- A player's vouchers
create or replace function public.my_bracelets(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', b.id, 'offer_type', b.offer_type, 'offer_value', b.offer_value,
    'bar', (select name from public.venues where id = public.bracelet_home_venue(b.id)),
    'valid_night', b.valid_night, 'valid_nights', b.valid_nights,
    'state', case when b.redeemed_at is not null then 'used'
                  when b.valid_night is not null and b.valid_night + (b.valid_nights - 1) < public.bar_night() then 'expired'
                  when public.bracelet_valid_tonight(b.valid_night, b.valid_nights) then 'tonight'
                  else 'upcoming' end,
    'redeemed_at', b.redeemed_at) order by b.valid_night nulls last), '[]'::json)
  from public.bracelet_drops b where b.holder_id = p_user;
$$;

-- The code on a voucher changes every 30 seconds (a screenshot is useless a minute later)
create or replace function public.voucher_code_at(p_secret text, p_window bigint)
returns text language sql immutable as $$
  select upper(translate(substr(md5(p_secret || ':' || p_window), 1, 6), '01', 'XY'));
$$;

create or replace function public.voucher_code(p_user uuid, p_bracelet uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare b record; w bigint := floor(extract(epoch from now()) / 30);
begin
  select * into b from public.bracelet_drops where id = p_bracelet and holder_id = p_user;
  if not found then raise exception 'NOT_YOURS'; end if;
  if b.redeemed_at is not null then raise exception 'ALREADY_USED'; end if;
  return json_build_object('code', public.voucher_code_at(b.voucher_secret, w), 'payload', 'BWV:' || b.id || ':' || public.voucher_code_at(b.voucher_secret, w),
                           'seconds_left', 30 - (floor(extract(epoch from now()))::bigint % 30));
end $$;

-- Door Mode: scan the voucher QR (or type its 6-character code); valid → marked used
create or replace function public.redeem_voucher(p_user uuid, p_venue uuid, p_payload text)
returns json language plpgsql security definer set search_path = public as $$
declare w bigint := floor(extract(epoch from now()) / 30); pid uuid; code text; b record; n int;
begin
  if not public.can_work_door(p_user, p_venue) then raise exception 'NOT_DOOR_STAFF'; end if;
  if p_payload ~* '^BWV:[0-9a-f-]{36}:[A-Z0-9]{6}$' then
    pid := split_part(p_payload, ':', 2)::uuid; code := upper(split_part(p_payload, ':', 3));
    select * into b from public.bracelet_drops where id = pid for update;
    if not found or code not in (public.voucher_code_at(b.voucher_secret, w), public.voucher_code_at(b.voucher_secret, w - 1)) then
      return json_build_object('ok', false, 'reason', 'Code expired or not valid. Ask them to open the voucher again.');
    end if;
  else
    code := upper(regexp_replace(coalesce(p_payload, ''), '[^A-Za-z0-9]', '', 'g'));
    if length(code) <> 6 then return json_build_object('ok', false, 'reason', 'Not a BarWars voucher.'); end if;
    select count(*) into n from public.bracelet_drops d
     where d.holder_id is not null and d.redeemed_at is null and public.bracelet_home_venue(d.id) = p_venue
       and code in (public.voucher_code_at(d.voucher_secret, w), public.voucher_code_at(d.voucher_secret, w - 1));
    if n <> 1 then return json_build_object('ok', false, 'reason', 'Code not found. Scan the QR instead.'); end if;
    select * into b from public.bracelet_drops d
     where d.holder_id is not null and d.redeemed_at is null and public.bracelet_home_venue(d.id) = p_venue
       and code in (public.voucher_code_at(d.voucher_secret, w), public.voucher_code_at(d.voucher_secret, w - 1))
     for update;
  end if;
  if b.holder_id is null then return json_build_object('ok', false, 'reason', 'This bracelet has no owner.'); end if;
  if b.redeemed_at is not null then
    return json_build_object('ok', false, 'reason', 'Already used ' || to_char(b.redeemed_at at time zone 'America/Chicago', 'Mon DD, HH12:MI AM'));
  end if;
  if public.bracelet_home_venue(b.id) <> p_venue then
    return json_build_object('ok', false, 'reason', 'Wrong bar: this one is for ' || (select name from public.venues where id = public.bracelet_home_venue(b.id)) || '.');
  end if;
  if not public.bracelet_valid_tonight(b.valid_night, b.valid_nights) then
    return json_build_object('ok', false, 'reason', case when b.valid_night > public.bar_night()
      then 'Not valid yet: good for ' || to_char(b.valid_night, 'Dy Mon DD') || '.' else 'Expired: it was good for ' || to_char(b.valid_night, 'Dy Mon DD') || '.' end);
  end if;
  update public.bracelet_drops set redeemed_at = now(), redeemed_by = p_user where id = b.id;
  return json_build_object('ok', true, 'offer_type', b.offer_type,
    'offer', case b.offer_type when 'no_cover' then 'No cover' when 'drink' then coalesce(b.offer_value, 'Drink offer') || ' (21+: check ID)' else coalesce(b.offer_value, 'Offer') end,
    'bar', (select name from public.venues where id = p_venue));
end $$;

-- Tonight at a glance for the bar: bands out vs. redeemed
create or replace function public.bracelet_night_summary(p_user uuid, p_venue uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_work_door(p_user, p_venue) then raise exception 'NOT_DOOR_STAFF'; end if;
  return json_build_object(
    'in_stock', (select count(*) from public.bracelet_drops where venue_id = p_venue and status = 'in_stock' and received_at is not null),
    'printed_not_received', (select count(*) from public.bracelet_drops where venue_id = p_venue and status = 'in_stock' and received_at is null),
    'hidden_tonight', (select count(*) from public.bracelet_drops where venue_id = p_venue and status = 'hidden' and public.bracelet_valid_tonight(valid_night, valid_nights)),
    'held_valid_tonight', (select count(*) from public.bracelet_drops d where public.bracelet_home_venue(d.id) = p_venue and d.holder_id is not null
                            and d.redeemed_at is null and public.bracelet_valid_tonight(d.valid_night, d.valid_nights)),
    'redeemed_tonight', (select count(*) from public.bracelet_drops d where public.bracelet_home_venue(d.id) = p_venue
                          and d.redeemed_at is not null and public.bar_night(d.redeemed_at) = public.bar_night()));
end $$;

revoke all on function public.can_work_door(uuid, uuid), public.create_staff_invite(uuid, uuid, text, text, text), public.print_bracelet_tags(uuid, uuid, int),
  public.receive_bracelet(uuid, uuid, uuid), public.hide_bracelet(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, date, int),
  public.bracelet_home_venue(uuid), public.my_bracelets(uuid), public.voucher_code(uuid, uuid), public.redeem_voucher(uuid, uuid, text),
  public.bracelet_night_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_work_door(uuid, uuid), public.create_staff_invite(uuid, uuid, text, text, text), public.print_bracelet_tags(uuid, uuid, int),
  public.receive_bracelet(uuid, uuid, uuid), public.hide_bracelet(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, date, int),
  public.bracelet_home_venue(uuid), public.my_bracelets(uuid), public.voucher_code(uuid, uuid), public.redeem_voucher(uuid, uuid, text),
  public.bracelet_night_summary(uuid, uuid) to service_role;

-- fix_print_bracelet_tags: a data-changing WITH can't sit inside RETURN
create or replace function public.print_bracelet_tags(p_staff uuid, p_venue uuid, p_count int)
returns json language plpgsql security definer set search_path = public as $$
declare out json;
begin
  if not exists (select 1 from public.profiles where id = p_staff and is_staff) then raise exception 'STAFF_ONLY'; end if;
  if p_count < 1 or p_count > 100 then raise exception 'BAD_COUNT'; end if;
  with ins as (
    insert into public.bracelet_drops (venue_id, status, drop_week, offer_type)
    select p_venue, 'in_stock', date_trunc('week', now() at time zone 'America/Chicago')::date, 'no_cover' from generate_series(1, p_count)
    returning qr_token)
  select json_agg(qr_token) into out from ins;
  return out;
end $$;
