-- Item 20: one referee for Turf Wars, blended scoring, underdog bonus, streak tax.
-- Before this, three routes decided wars three ways: the attacker won on hitting its threshold
-- even when the defender brought more people; wars ended mid-window on a single check-in;
-- allies never counted; "contested" wars never closed; and nothing opened or closed wars at all
-- (the scheduler edge function had no trigger). No wars had been fought yet.

alter table public.turf_claims
  add column if not exists attacker_size integer,
  add column if not exists defender_size integer,
  add column if not exists attacker_score numeric(5,1),
  add column if not exists defender_score numeric(5,1),
  add column if not exists winner_org_id uuid references public.greek_orgs(id) on delete set null,
  add column if not exists resolved_at timestamptz;

-- Leaderboard points: 1 per win, x1.5 for beating an org 1.5x your size, x0.8 when on a 4+ week streak
alter table public.greek_orgs add column if not exists war_points numeric(10,2) not null default 0;

-- Freeze each side's verified size when the war is declared (no padding or trimming mid-war)
create or replace function public.tg_turf_claim_sizes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.attacker_size := coalesce(new.attacker_size,
    (select count(*) from public.org_memberships where org_id = new.attacking_org_id and verified));
  if new.defending_org_id is not null then
    new.defender_size := coalesce(new.defender_size,
      (select count(*) from public.org_memberships where org_id = new.defending_org_id and verified));
  end if;
  return new;
end $$;
drop trigger if exists turf_claim_sizes on public.turf_claims;
create trigger turf_claim_sizes before insert on public.turf_claims
  for each row execute function public.tg_turf_claim_sizes();

-- Live counts straight from the check-in records (no lost counts when two people check in at
-- once). Flagged check-ins count only once staff approve them. Allies count at their weight.
create or replace function public.recount_turf_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select attacking_org_id, defending_org_id into c from public.turf_claims where id = p_claim;
  if not found then return; end if;
  with counted as (
    select t.* from public.turf_checkins t
    where t.claim_id = p_claim
      and not exists (select 1 from public.flagged_checkins f where f.checkin_id = t.id and f.status <> 'approved')
  )
  update public.turf_claims set
    attacker_verified_headcount = (select count(*) from counted where org_id = c.attacking_org_id and ally_id is null),
    defender_verified_headcount = (select count(*) from counted where org_id = c.defending_org_id and ally_id is null),
    attacker_weighted_headcount = (select coalesce(sum(headcount_weight), 0) from counted where org_id = c.attacking_org_id),
    defender_weighted_headcount = (select coalesce(sum(headcount_weight), 0) from counted where org_id = c.defending_org_id)
  where id = p_claim;
end $$;

-- The referee. Runs once, when the war window closes.
create or replace function public.resolve_turf_war(p_claim uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  c public.turf_claims%rowtype;
  att_heads numeric; def_heads numeric; att_mem int; def_mem int;
  att_size int; def_size int; mx numeric; att_score numeric; def_score numeric := 0;
  v_status text; v_result text; winner uuid; loser uuid;
  w_size int; l_size int; w_streak int; mult numeric := 1; underdog boolean := false;
  bar_name text; w_name text;
begin
  select * into c from public.turf_claims where id = p_claim for update;
  if not found or c.status not in ('live', 'contested') then return null; end if;

  perform public.recount_turf_claim(p_claim);
  select * into c from public.turf_claims where id = p_claim;
  att_heads := c.attacker_weighted_headcount; def_heads := coalesce(c.defender_weighted_headcount, 0);
  att_mem := c.attacker_verified_headcount;  def_mem := coalesce(c.defender_verified_headcount, 0);
  att_size := greatest(coalesce(c.attacker_size, 0), att_mem, 1);
  def_size := greatest(coalesce(c.defender_size, 0), def_mem, 1);

  -- War score = 50 x (your headcount / the bigger side's) + 50 x turnout (members out / verified members)
  mx := greatest(att_heads, def_heads);
  att_score := case when mx > 0 then round(50 * att_heads / mx + 50 * least(1, att_mem::numeric / att_size), 1) else 0 end;
  if c.defending_org_id is not null then
    def_score := case when mx > 0 then round(50 * def_heads / mx + 50 * least(1, def_mem::numeric / def_size), 1) else 0 end;
  end if;

  if att_heads < c.required_headcount then
    v_status := 'failed';
    v_result := format('Attack failed: %s showed up, %s were needed.', trim_scale(att_heads), c.required_headcount);
    if c.defending_org_id is not null and def_heads > 0 then winner := c.defending_org_id; loser := c.attacking_org_id; end if;
  elsif c.defending_org_id is null then
    v_status := 'successful'; winner := c.attacking_org_id;
    v_result := format('Unclaimed bar taken with %s on the ground.', trim_scale(att_heads));
  elsif att_score > def_score then
    v_status := 'successful'; winner := c.attacking_org_id; loser := c.defending_org_id;
    v_result := format('Attacker wins %s to %s (headcount %s vs %s, turnout %s%% vs %s%%).',
      att_score, def_score, trim_scale(att_heads), trim_scale(def_heads),
      round(100 * least(1, att_mem::numeric / att_size)), round(100 * least(1, def_mem::numeric / def_size)));
  else
    v_status := 'failed'; winner := c.defending_org_id; loser := c.attacking_org_id;
    v_result := format('Defender holds %s to %s (headcount %s vs %s, turnout %s%% vs %s%%).',
      def_score, att_score, trim_scale(def_heads), trim_scale(att_heads),
      round(100 * least(1, def_mem::numeric / def_size)), round(100 * least(1, att_mem::numeric / att_size)));
  end if;

  -- Records and leaderboard points
  if winner is not null then
    w_size := case when winner = c.attacking_org_id then att_size else def_size end;
    l_size := case when winner = c.attacking_org_id then def_size else att_size end;
    select coalesce(turf_streak_weeks, 0), name into w_streak, w_name from public.greek_orgs where id = winner;
    underdog := loser is not null and l_size >= 1.5 * w_size;
    mult := (case when underdog then 1.5 else 1 end) * (case when w_streak >= 4 then 0.8 else 1 end);
    update public.greek_orgs set war_points = war_points + mult, turf_wins = turf_wins + 1,
      longest_turf_streak_weeks = greatest(longest_turf_streak_weeks, turf_streak_weeks) where id = winner;
    if loser is not null then update public.greek_orgs set turf_losses = turf_losses + 1 where id = loser; end if;
    if c.claim_type = 'war_declaration' then
      update public.greek_orgs set wars_won = wars_won + 1 where id = winner;
      if loser is not null then update public.greek_orgs set wars_lost = wars_lost + 1 where id = loser; end if;
    elsif c.claim_type = 'sneak_attack' and winner = c.defending_org_id then
      update public.greek_orgs set sneak_attacks_repelled = sneak_attacks_repelled + 1 where id = c.defending_org_id;
    end if;
  end if;

  -- Turf changes hands only on a successful attack
  if v_status = 'successful' then
    if c.defending_org_id is not null then
      update public.greek_orgs set home_turf_bar_id = null, turf_claimed_at = null, turf_streak_weeks = 0
       where id = c.defending_org_id and home_turf_bar_id = c.bar_id;
    end if;
    update public.greek_orgs set home_turf_bar_id = c.bar_id, turf_claimed_at = now(), turf_streak_weeks = 1
     where id = c.attacking_org_id;
  end if;

  update public.turf_claims set
    status = v_status::claim_status, result = v_result,
    attacker_score = att_score, defender_score = case when c.defending_org_id is null then null else def_score end,
    winner_org_id = winner, resolved_at = now(),
    underdog_bonus = underdog, war_points_multiplier = mult
  where id = p_claim;

  select name into bar_name from public.venues where id = c.bar_id;
  insert into public.turf_events (claim_id, event_type, org_id, bar_id, headline, body, deep_link, visible_to)
  values (p_claim,
    (case when v_status = 'successful' then 'war_declared' else 'turf_defended' end)::turf_event_type,
    coalesce(winner, c.attacking_org_id), c.bar_id,
    case when v_status = 'successful' then format('%s took %s', coalesce(w_name, 'An org'), coalesce(bar_name, 'a bar'))
         when winner is not null then format('%s held %s', coalesce(w_name, 'The defender'), coalesce(bar_name, 'a bar'))
         else format('Attack on %s fizzled', coalesce(bar_name, 'a bar')) end
      || case when underdog then ' (underdog win)' else '' end,
    v_result, '/turf-wars/' || p_claim, 'public');

  return json_build_object('status', v_status, 'winner', winner, 'attacker_score', att_score, 'defender_score', def_score,
                           'underdog', underdog, 'points', mult, 'result', v_result);
end $$;

-- The clock: open wars when their window starts, referee them when it ends
create or replace function public.run_turf_war_clock()
returns json language plpgsql security definer set search_path = public as $$
declare opened int; resolved int := 0; r record;
begin
  update public.turf_claims set status = 'live'
   where status = 'pending' and window_open_at <= now() and window_close_at > now();
  get diagnostics opened = row_count;
  update public.turf_claims set status = 'cancelled', cancel_reason = 'Window passed before the war opened'
   where status = 'pending' and window_close_at <= now();
  for r in select id from public.turf_claims where status in ('live', 'contested') and window_close_at <= now() loop
    perform public.resolve_turf_war(r.id); resolved := resolved + 1;
  end loop;
  return json_build_object('opened', opened, 'resolved', resolved);
end $$;

revoke all on function public.recount_turf_claim(uuid) from public, anon, authenticated;
revoke all on function public.resolve_turf_war(uuid) from public, anon, authenticated;
revoke all on function public.run_turf_war_clock() from public, anon, authenticated;
grant execute on function public.recount_turf_claim(uuid), public.resolve_turf_war(uuid), public.run_turf_war_clock() to service_role;

select cron.schedule('turf-war-clock', '* * * * *', $$ select public.run_turf_war_clock(); $$);
