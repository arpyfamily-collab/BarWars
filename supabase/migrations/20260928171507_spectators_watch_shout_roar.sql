-- Item 18 (spectators): public Watch Link, The Shout, Crowd Roar, "email me when the next war starts".
-- Decided by Brian, Sep 28: the public page never shows names (side and org only); signed-out
-- spectators confirm by email (phone waits for Twilio); Shouts are 140 characters, no links or
-- phone numbers, go up immediately, can be reported (hidden at 3 reports) and removed by staff.

create table if not exists public.war_shouts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text check (side in ('attacker', 'defender')),
  content text not null check (char_length(content) between 1 and 140),
  share_ref text,
  report_count integer not null default 0,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (claim_id, user_id)
);
alter table public.war_shouts enable row level security;

create table if not exists public.war_shout_reports (
  shout_id uuid not null references public.war_shouts(id) on delete cascade,
  reporter_key text not null,
  created_at timestamptz not null default now(),
  primary key (shout_id, reporter_key)
);
alter table public.war_shout_reports enable row level security;

create table if not exists public.war_roars (
  claim_id uuid not null references public.turf_claims(id) on delete cascade,
  side text not null check (side in ('attacker', 'defender')),
  roar_key text not null,
  roars integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (claim_id, side, roar_key)
);
alter table public.war_roars enable row level security;

create table if not exists public.spectator_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  marketing_opt_in boolean not null default false,
  next_war_alerts boolean not null default false,
  source text,
  updated_at timestamptz not null default now()
);
alter table public.spectator_consents enable row level security;

-- Everything a public Watch Link shows: no names, no account ids
create or replace function public.watch_war(p_claim uuid)
returns json language sql stable security definer set search_path = public as $$
  with c as (
    select t.*, v.name bar_name, ao.name att_name, dofg.name def_name
    from public.turf_claims t
    left join public.venues v on v.id = t.bar_id
    left join public.greek_orgs ao on ao.id = t.attacking_org_id
    left join public.greek_orgs dofg on dofg.id = t.defending_org_id
    where t.id = p_claim
  ), bf as (
    select ch.id from public.channels ch where ch.claim_id = p_claim and ch.channel_type = 'battlefield'
  ), msgs as (
    select m.id, m.content, m.created_at,
           (select s.side from public.channels s join public.channel_members cm on cm.channel_id = s.id
             where s.claim_id = p_claim and s.channel_type = 'war_side' and cm.user_id = m.sender_id limit 1) as side,
           (select cm.role from public.channels s join public.channel_members cm on cm.channel_id = s.id
             where s.claim_id = p_claim and s.channel_type = 'war_side' and cm.user_id = m.sender_id limit 1) as role
    from public.messages m
    where m.channel_id in (select id from bf) and m.status = 'active' and m.report_count < 3
    order by m.created_at desc limit 100
  )
  select json_build_object(
    'war', (select json_build_object('id', c.id, 'bar', c.bar_name, 'attacker', c.att_name, 'defender', c.def_name,
             'status', c.status, 'claim_type', c.claim_type, 'window_open_at', c.window_open_at, 'window_close_at', c.window_close_at,
             'attacker_headcount', c.attacker_weighted_headcount, 'defender_headcount', c.defender_weighted_headcount,
             'required_headcount', c.required_headcount, 'attacker_score', c.attacker_score, 'defender_score', c.defender_score,
             'result', c.result, 'underdog', c.underdog_bonus) from c),
    'battlefield', coalesce((select json_agg(json_build_object('id', m.id, 'content', m.content, 'at', m.created_at,
             'label', case when m.side is null then 'Fighter'
                           else initcap(m.side) || ' · ' || coalesce(case when m.role = 'hired' then 'Hired gun'
                                                                           when m.side = 'attacker' then (select att_name from c)
                                                                           else (select def_name from c) end, 'Fighter') end,
             'side', m.side) order by m.created_at) from msgs m), '[]'::json),
    'shouts', coalesce((select json_agg(json_build_object('id', s.id, 'content', s.content, 'side', s.side, 'at', s.created_at) order by s.created_at desc)
             from public.war_shouts s where s.claim_id = p_claim and s.removed_at is null and s.report_count < 3), '[]'::json),
    'roars', json_build_object(
             'attacker', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'attacker'),
             'defender', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'defender')));
$$;

-- One Shout per spectator per war
create or replace function public.post_shout(p_user uuid, p_claim uuid, p_side text, p_content text, p_ref text,
                                             p_marketing boolean, p_alerts boolean)
returns json language plpgsql security definer set search_path = public as $$
declare st text; txt text := btrim(coalesce(p_content, '')); new_id uuid;
begin
  select status into st from public.turf_claims where id = p_claim;
  if st is null or st not in ('pending', 'operator_pending', 'live', 'contested') then raise exception 'WAR_NOT_ACTIVE'; end if;
  if char_length(txt) < 1 or char_length(txt) > 140 then raise exception 'BAD_LENGTH'; end if;
  if txt ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|app|co|me|gg|ly|us|edu)\M)' then raise exception 'NO_LINKS'; end if;
  if txt ~ '(\+?\d[\s().-]*){10,}' then raise exception 'NO_PHONE'; end if;
  if p_side is not null and p_side not in ('attacker', 'defender') then raise exception 'BAD_SIDE'; end if;
  insert into public.spectator_consents (user_id, marketing_opt_in, next_war_alerts, source)
  values (p_user, coalesce(p_marketing, false), coalesce(p_alerts, false), 'watch:' || p_claim)
  on conflict (user_id) do update set marketing_opt_in = excluded.marketing_opt_in or spectator_consents.marketing_opt_in,
    next_war_alerts = excluded.next_war_alerts or spectator_consents.next_war_alerts, updated_at = now();
  begin
    insert into public.war_shouts (claim_id, user_id, side, content, share_ref) values (p_claim, p_user, p_side, txt, left(p_ref, 40))
    returning id into new_id;
  exception when unique_violation then raise exception 'ALREADY_SHOUTED';
  end;
  return json_build_object('id', new_id);
end $$;

-- Crowd Roar: anyone watching a live war; each visitor counts at most 25 roars per side per war
create or replace function public.roar(p_claim uuid, p_side text, p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.turf_claims where id = p_claim;
  if st is null or st not in ('live', 'contested') then raise exception 'WAR_NOT_LIVE'; end if;
  if p_side not in ('attacker', 'defender') then raise exception 'BAD_SIDE'; end if;
  insert into public.war_roars (claim_id, side, roar_key, roars) values (p_claim, p_side, p_key, 1)
  on conflict (claim_id, side, roar_key) do update set roars = least(public.war_roars.roars + 1, 25), updated_at = now();
  return json_build_object(
    'attacker', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'attacker'),
    'defender', (select coalesce(sum(roars), 0) from public.war_roars where claim_id = p_claim and side = 'defender'));
end $$;

-- Anyone can report a Shout once; hidden at 3 reports until staff review
create or replace function public.report_shout(p_shout uuid, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.war_shout_reports (shout_id, reporter_key) values (p_shout, p_key) on conflict do nothing;
  if found then update public.war_shouts set report_count = report_count + 1 where id = p_shout; end if;
end $$;

-- "Email me when the next war starts" (signed-in spectators; sending waits for an email provider)
create or replace function public.set_war_alerts(p_user uuid, p_on boolean)
returns void language sql security definer set search_path = public as $$
  insert into public.spectator_consents (user_id, next_war_alerts, source) values (p_user, p_on, 'watch')
  on conflict (user_id) do update set next_war_alerts = p_on, updated_at = now();
$$;

revoke all on function public.watch_war(uuid), public.post_shout(uuid, uuid, text, text, text, boolean, boolean),
  public.roar(uuid, text, text), public.report_shout(uuid, text), public.set_war_alerts(uuid, boolean) from public, anon, authenticated;
grant execute on function public.watch_war(uuid), public.post_shout(uuid, uuid, text, text, text, boolean, boolean),
  public.roar(uuid, text, text), public.report_shout(uuid, text), public.set_war_alerts(uuid, boolean) to service_role;
