-- 1. Regiment links: players could insert a link already marked 'linked' or accept their own
--    request, then draft people into a Regiment without consent. The app writes this table only
--    through server routes, so direct writes are closed. Players keep read access to their own links.
drop policy if exists "initiate link" on public.regiment_links;
drop policy if exists "respond to link" on public.regiment_links;

-- 2. Hessian company invite links (To-Do item 2)
create table if not exists public.hessian_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.hessian_companies(id) on delete cascade,
  code text not null unique default replace(replace(rtrim(encode(extensions.gen_random_bytes(9), 'base64'), '='), '+', '-'), '/', '_'),
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 25 check (max_uses between 1 and 100),
  uses_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hessian_invites_company_idx on public.hessian_invites(company_id);
alter table public.hessian_invites enable row level security;   -- server only: no policies

-- Who joined through whose invite: the record the referral program (item 15) will credit
create table if not exists public.hessian_invite_joins (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.hessian_invites(id) on delete set null,
  company_id uuid not null references public.hessian_companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (company_id, user_id)
);
alter table public.hessian_invite_joins enable row level security;  -- server only

-- 3. Redeem an invite: atomic, server-only. A link works only while its creator is the captain,
--    and joining through the captain's own link skips approval. Faction rules still apply
--    (the faction_rules trigger fires on the insert/verify).
create or replace function public.redeem_hessian_invite(p_user uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv public.hessian_invites%rowtype;
  v_captain uuid;
  v_name text;
  v_mine record;
begin
  select * into v_inv from public.hessian_invites where code = p_code for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if v_inv.revoked_at is not null then raise exception 'INVITE_INVALID'; end if;
  if v_inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_inv.uses_count >= v_inv.max_uses then raise exception 'INVITE_FULL'; end if;

  select captain_id, name into v_captain, v_name from public.hessian_companies where id = v_inv.company_id;
  if v_captain is null or v_captain is distinct from v_inv.created_by then raise exception 'INVITE_INVALID'; end if;
  if p_user = v_captain then raise exception 'INVITE_OWN'; end if;

  select company_id, verified into v_mine from public.hessian_members where user_id = p_user;
  if found then
    if v_mine.company_id <> v_inv.company_id then raise exception 'ALREADY_IN_COMPANY'; end if;
    if v_mine.verified then return json_build_object('company_id', v_inv.company_id, 'name', v_name, 'already', true); end if;
    update public.hessian_members set verified = true where user_id = p_user and company_id = v_inv.company_id;
  else
    insert into public.hessian_members (company_id, user_id, role, verified)
    values (v_inv.company_id, p_user, 'member', true);
  end if;

  update public.hessian_invites set uses_count = uses_count + 1 where id = v_inv.id;
  insert into public.hessian_invite_joins (invite_id, company_id, user_id, invited_by)
  values (v_inv.id, v_inv.company_id, p_user, v_inv.created_by)
  on conflict (company_id, user_id) do nothing;
  perform public.recount_unit('company', v_inv.company_id);

  return json_build_object('company_id', v_inv.company_id, 'name', v_name, 'already', false);
end $$;

revoke all on function public.redeem_hessian_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_hessian_invite(uuid, text) to service_role;
