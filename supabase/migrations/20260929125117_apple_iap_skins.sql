-- Paid skins through Apple in-app purchase (server side, ready for Build 4's purchase button).
alter table public.skins add column if not exists apple_product_id text unique;
update public.skins set apple_product_id = 'com.arpyfamily.barwars.skin.' || replace(slug, '-', '_') where price_cents > 0 and apple_product_id is null;
create table if not exists public.iap_transactions (
  transaction_id text primary key, original_transaction_id text, user_id uuid references public.profiles(id) on delete set null,
  product_id text not null, skin_id uuid references public.skins(id) on delete set null, environment text not null,
  purchased_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now());
alter table public.iap_transactions enable row level security;
alter table public.user_skins add column if not exists iap_transaction_id text;
create or replace function public.grant_iap_skin(p_user uuid, p_txn text, p_original text, p_product text, p_env text, p_purchased timestamptz)
returns json language plpgsql security definer set search_path = public as $$
declare s record; t record;
begin
  select id, name, active into s from public.skins where apple_product_id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
  select * into t from public.iap_transactions where transaction_id = p_txn for update;
  if found then
    if t.user_id is distinct from p_user then raise exception 'TXN_OTHER_USER'; end if;
    if t.revoked_at is not null then raise exception 'TXN_REFUNDED'; end if;
    return json_build_object('skin_id', s.id, 'skin', s.name, 'already', true);
  end if;
  insert into public.iap_transactions (transaction_id, original_transaction_id, user_id, product_id, skin_id, environment, purchased_at)
  values (p_txn, p_original, p_user, p_product, s.id, p_env, p_purchased);
  insert into public.user_skins (user_id, skin_id, ownership_type, amount_paid, iap_transaction_id) values (p_user, s.id, 'purchased', 0, p_txn)
  on conflict (user_id, skin_id) do update set ownership_type = 'purchased', iap_transaction_id = excluded.iap_transaction_id;
  update public.skins set sold_count = sold_count + 1 where id = s.id;
  return json_build_object('skin_id', s.id, 'skin', s.name, 'already', false);
end $$;
create or replace function public.revoke_iap_skin(p_txn text)
returns json language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from public.iap_transactions where transaction_id = p_txn or original_transaction_id = p_txn order by created_at desc limit 1 for update;
  if not found then return json_build_object('found', false); end if;
  update public.iap_transactions set revoked_at = coalesce(revoked_at, now()) where transaction_id = t.transaction_id;
  delete from public.user_skins where user_id = t.user_id and skin_id = t.skin_id and iap_transaction_id = t.transaction_id;
  return json_build_object('found', true, 'user_id', t.user_id, 'skin_id', t.skin_id);
end $$;
revoke all on function public.grant_iap_skin(uuid, text, text, text, text, timestamptz), public.revoke_iap_skin(text) from public, anon, authenticated;
grant execute on function public.grant_iap_skin(uuid, text, text, text, text, timestamptz), public.revoke_iap_skin(text) to service_role;
