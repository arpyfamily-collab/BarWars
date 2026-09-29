-- Item 14: pay mercenaries in bracelets (Brian, Sep 26/28). Only no-cover or non-alcoholic ("other")
-- bracelets, never drink offers; only a bracelet that has never changed hands; the recipient must be 18+;
-- the mercenary sees the offer, bar and night before accepting. The bracelet is locked (escrow) as soon as
-- it's offered, so it can't be promised twice or shown at the door; it goes to the mercenary when the
-- contract is completed, and stays with the hirer if the contract is rejected, fails, or its night passes.

alter table public.mercenary_contracts
  add column if not exists hired_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_bracelet_id uuid references public.bracelet_drops(id) on delete set null;
alter table public.bracelet_drops add column if not exists escrow_contract_id uuid;

create or replace function public.bracelet_last_night(p_night date, p_nights smallint)
returns date language sql immutable as $$ select case when p_night is null then null else p_night + (p_nights - 1) end $$;

create or replace function public.tg_contract_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare b record; merc_user uuid;
begin
  if tg_op = 'INSERT' then
    if new.payment_bracelet_id is null then return new; end if;
    select * into b from public.bracelet_drops where id = new.payment_bracelet_id for update;
    if not found or new.hired_by is null or b.holder_id is distinct from new.hired_by then raise exception 'PAYMENT_NOT_YOURS'; end if;
    if b.offer_type = 'drink' then raise exception 'PAYMENT_NO_DRINKS'; end if;
    if b.transfers > 0 then raise exception 'PAYMENT_ALREADY_TRADED'; end if;
    if b.redeemed_at is not null then raise exception 'PAYMENT_USED'; end if;
    if b.escrow_contract_id is not null then raise exception 'PAYMENT_IN_ESCROW'; end if;
    if public.bracelet_last_night(b.valid_night, b.valid_nights) < public.bar_night() then raise exception 'PAYMENT_EXPIRED'; end if;
    update public.bracelet_drops set escrow_contract_id = new.id where id = b.id;
    return new;
  end if;
  -- UPDATE of status
  if new.payment_bracelet_id is null or new.status = old.status then return new; end if;
  select * into b from public.bracelet_drops where id = new.payment_bracelet_id for update;
  if not found or b.escrow_contract_id is distinct from new.id then return new; end if;
  if new.status::text = 'accepted' then
    select user_id into merc_user from public.mercenaries where id = new.mercenary_id;
    if not exists (select 1 from public.profiles where id = merc_user and age_verified) then raise exception 'PAYMENT_RECIPIENT_18'; end if;
    if public.bracelet_last_night(b.valid_night, b.valid_nights) < public.bar_night() then raise exception 'PAYMENT_EXPIRED'; end if;
  elsif new.status::text = 'completed' then
    select user_id into merc_user from public.mercenaries where id = new.mercenary_id;
    if public.bracelet_last_night(b.valid_night, b.valid_nights) >= public.bar_night() or b.valid_night is null then
      update public.bracelet_drops set holder_id = merc_user, transfers = transfers + 1, escrow_contract_id = null where id = b.id;
    else
      update public.bracelet_drops set escrow_contract_id = null where id = b.id;   -- its night passed: the hirer keeps it
    end if;
  elsif new.status::text in ('rejected', 'failed') then
    update public.bracelet_drops set escrow_contract_id = null where id = b.id;
  end if;
  return new;
end $$;
drop trigger if exists contract_payment on public.mercenary_contracts;
create trigger contract_payment before insert or update of status on public.mercenary_contracts
  for each row execute function public.tg_contract_payment();

-- A locked bracelet can't be shown at the door
create or replace function public.voucher_code(p_user uuid, p_bracelet uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare b record; w bigint := floor(extract(epoch from now()) / 30);
begin
  select * into b from public.bracelet_drops where id = p_bracelet and holder_id = p_user;
  if not found then raise exception 'NOT_YOURS'; end if;
  if b.redeemed_at is not null then raise exception 'ALREADY_USED'; end if;
  if b.escrow_contract_id is not null then raise exception 'IN_ESCROW'; end if;
  return json_build_object('code', public.voucher_code_at(b.voucher_secret, w), 'payload', 'BWV:' || b.id || ':' || public.voucher_code_at(b.voucher_secret, w),
                           'seconds_left', 30 - (floor(extract(epoch from now()))::bigint % 30));
end $$;

create or replace function public.my_bracelets(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', b.id, 'offer_type', b.offer_type, 'offer_value', b.offer_value,
    'bar', (select name from public.venues where id = public.bracelet_home_venue(b.id)),
    'valid_night', b.valid_night, 'valid_nights', b.valid_nights,
    'state', case when b.redeemed_at is not null then 'used'
                  when public.bracelet_last_night(b.valid_night, b.valid_nights) < public.bar_night() then 'expired'
                  when b.escrow_contract_id is not null then 'escrow'
                  when public.bracelet_valid_tonight(b.valid_night, b.valid_nights) then 'tonight'
                  else 'upcoming' end,
    'payable', b.redeemed_at is null and b.escrow_contract_id is null and b.transfers = 0 and b.offer_type <> 'drink'
               and coalesce(public.bracelet_last_night(b.valid_night, b.valid_nights) >= public.bar_night(), true),
    'redeemed_at', b.redeemed_at) order by b.valid_night nulls last), '[]'::json)
  from public.bracelet_drops b where b.holder_id = p_user;
$$;
