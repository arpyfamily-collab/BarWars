-- BarWars — Bar vs Bar Challenge Schema
-- Migration 002: challenges, scoring, notifications, battle boosts, nominations
-- NOTE: removed GiST exclusion constraint (uuid has no default gist opclass)
--       and replaced with a partial unique index for live challenge overlap detection.

create type challenge_status as enum (
  'proposed', 'opponent_pending', 'operator_pending',
  'approved', 'live', 'completed', 'cancelled', 'forfeit_unpaid'
);

create type scoring_metric as enum (
  'checkins_only', 'passes_only', 'checkins_and_passes', 'full_composite'
);

create type score_event_type as enum (
  'checkin', 'pass_purchase', 'room_upgrade', 'drink_purchase', 'referral_checkin'
);

create type notification_trigger_type as enum (
  'challenge_proposed', 'opponent_accepted', 'opponent_declined',
  'operator_approved', 'war_declared', 'side_chosen_share',
  'momentum_surge', 'score_flip', 'thirty_min_warning',
  'battle_boost', 'winner_declared', 'forfeit_reminder', 'consolation_credit'
);

create type notification_audience as enum (
  'challenger_admin', 'opponent_admin', 'both_admins', 'operator',
  'all_geofenced_users', 'all_participants', 'winning_participants',
  'losing_participants', 'trailing_participants', 'nearby_non_checkins'
);

create table bar_challenges (
  id                    uuid primary key default uuid_generate_v4(),
  challenger_bar_id     uuid not null references venues(id) on delete cascade,
  opponent_bar_id       uuid not null references venues(id) on delete cascade,
  approved_by           uuid references auth.users(id),
  status                challenge_status not null default 'proposed',
  scoring_metric        scoring_metric not null default 'checkins_and_passes',
  score_weights         jsonb not null default '{"checkin":1,"pass_purchase":3,"room_upgrade":2,"drink_purchase":1,"referral_checkin":5}',
  window_start          timestamptz not null,
  window_end            timestamptz not null,
  trash_talk            text not null check (char_length(trash_talk) <= 120),
  stakes_description    text not null,
  challenger_score      int not null default 0,
  opponent_score        int not null default 0,
  winner_bar_id         uuid references venues(id),
  forfeit_paid          boolean not null default false,
  forfeit_deadline      timestamptz,
  last_momentum_notification_at  timestamptz,
  cancel_reason         text,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  constraint different_bars check (challenger_bar_id <> opponent_bar_id),
  constraint window_valid   check (window_end > window_start),
  constraint window_min_2h  check (window_end - window_start >= interval '2 hours'),
  constraint window_max_8h  check (window_end - window_start <= interval '8 hours')
);

create table challenge_participants (
  id                       uuid primary key default uuid_generate_v4(),
  challenge_id             uuid not null references bar_challenges(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  chosen_bar_id            uuid not null references venues(id),
  points_contributed       int not null default 0,
  was_checked_in           boolean not null default false,
  earned_veteran_badge     boolean not null default false,
  consolation_credit_cents int not null default 0,
  referred_by_user_id      uuid references auth.users(id),
  referral_code            text unique default substr(md5(random()::text), 1, 8),
  joined_at                timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create table challenge_score_events (
  id             uuid primary key default uuid_generate_v4(),
  challenge_id   uuid not null references bar_challenges(id) on delete cascade,
  user_id        uuid not null references auth.users(id),
  bar_id         uuid not null references venues(id),
  event_type     score_event_type not null,
  points         int not null check (points > 0),
  source_ref     text,
  occurred_at    timestamptz not null default now()
);

create index score_events_challenge_idx on challenge_score_events(challenge_id);
create index score_events_bar_idx       on challenge_score_events(challenge_id, bar_id);
create index score_events_user_idx      on challenge_score_events(user_id, challenge_id);

create table challenge_notifications (
  id             uuid primary key default uuid_generate_v4(),
  challenge_id   uuid not null references bar_challenges(id) on delete cascade,
  trigger_type   notification_trigger_type not null,
  audience       notification_audience not null,
  headline       text not null,
  body           text,
  deep_link      text,
  sent           boolean not null default false,
  sent_count     int not null default 0,
  scheduled_at   timestamptz not null default now(),
  sent_at        timestamptz
);

create index notifications_challenge_idx on challenge_notifications(challenge_id);

create table challenge_battles_boosts (
  id              uuid primary key default uuid_generate_v4(),
  challenge_id    uuid not null references bar_challenges(id) on delete cascade,
  bar_id          uuid not null references venues(id),
  boost_type      text not null default 'discount',
  discount_cents  int not null default 0,
  max_claims      int not null default 50,
  claimed         int not null default 0,
  triggered_at    timestamptz not null default now(),
  expires_at      timestamptz not null
);

create unique index one_active_boost_per_bar on challenge_battles_boosts (challenge_id, bar_id);

create table challenge_nominations (
  id                   uuid primary key default uuid_generate_v4(),
  challenger_bar_id    uuid not null references venues(id),
  opponent_bar_id      uuid not null references venues(id),
  nominated_by         uuid not null references auth.users(id),
  nomination_fee_cents int not null default 200,
  stripe_payment_intent_id text,
  total_nominations    int not null default 1,
  jackpot_cents        int not null default 200,
  challenge_created    boolean not null default false,
  resulting_challenge_id uuid references bar_challenges(id),
  created_at           timestamptz not null default now(),
  constraint different_bars check (challenger_bar_id <> opponent_bar_id)
);

create or replace view nomination_leaderboard as
  select
    challenger_bar_id, opponent_bar_id,
    count(*) as nomination_count,
    sum(jackpot_cents) as total_jackpot_cents,
    max(created_at) as last_nominated_at,
    bool_or(challenge_created) as challenge_exists
  from challenge_nominations
  group by challenger_bar_id, opponent_bar_id
  order by total_jackpot_cents desc;

create table veteran_badges (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  challenge_id   uuid not null references bar_challenges(id),
  bar_id         uuid not null references venues(id),
  badge_name     text not null,
  won            boolean not null,
  awarded_at     timestamptz not null default now(),
  unique (user_id, challenge_id)
);

alter table venues
  add column if not exists wins   int not null default 0,
  add column if not exists losses int not null default 0,
  add column if not exists current_streak int not null default 0,
  add column if not exists forfeit_unpaid_count int not null default 0;

create or replace function record_challenge_score(
  p_challenge_id  uuid, p_user_id uuid, p_bar_id uuid,
  p_event_type    score_event_type, p_source_ref text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_challenge       bar_challenges; v_weight int;
  v_prev_leader     uuid; v_new_leader uuid;
  v_notification    jsonb := null; v_result jsonb;
begin
  select * into v_challenge from bar_challenges
  where id = p_challenge_id and status = 'live' for update;
  if not found then return jsonb_build_object('error', 'Challenge not live or not found'); end if;
  if p_bar_id not in (v_challenge.challenger_bar_id, v_challenge.opponent_bar_id) then
    return jsonb_build_object('error', 'Bar not in this challenge');
  end if;
  if p_source_ref is not null then
    if exists (select 1 from challenge_score_events
      where challenge_id = p_challenge_id and source_ref = p_source_ref
        and occurred_at > now() - interval '60 seconds') then
      return jsonb_build_object('error', 'Duplicate event', 'source_ref', p_source_ref);
    end if;
  end if;
  v_weight := coalesce((v_challenge.score_weights ->> p_event_type::text)::int, 1);
  v_prev_leader := case
    when v_challenge.challenger_score > v_challenge.opponent_score then v_challenge.challenger_bar_id
    when v_challenge.opponent_score   > v_challenge.challenger_score then v_challenge.opponent_bar_id
    else null end;
  insert into challenge_score_events (challenge_id, user_id, bar_id, event_type, points, source_ref)
  values (p_challenge_id, p_user_id, p_bar_id, p_event_type, v_weight, p_source_ref);
  update bar_challenges set
    challenger_score = challenger_score + case when p_bar_id = challenger_bar_id then v_weight else 0 end,
    opponent_score   = opponent_score   + case when p_bar_id = opponent_bar_id   then v_weight else 0 end
  where id = p_challenge_id returning * into v_challenge;
  update challenge_participants set
    points_contributed = points_contributed + v_weight,
    was_checked_in     = was_checked_in or (p_event_type = 'checkin')
  where challenge_id = p_challenge_id and user_id = p_user_id;
  v_new_leader := case
    when v_challenge.challenger_score > v_challenge.opponent_score then v_challenge.challenger_bar_id
    when v_challenge.opponent_score   > v_challenge.challenger_score then v_challenge.opponent_bar_id
    else null end;
  if v_prev_leader is distinct from v_new_leader and v_prev_leader is not null and v_new_leader is not null then
    v_notification := jsonb_build_object('type', 'score_flip', 'new_leader', v_new_leader);
  end if;
  if v_notification is null then
    declare v_lead int := abs(v_challenge.challenger_score - v_challenge.opponent_score);
            v_last timestamptz := v_challenge.last_momentum_notification_at;
    begin
      if v_lead >= 15 and (v_last is null or v_last < now() - interval '5 minutes') then
        update bar_challenges set last_momentum_notification_at = now() where id = p_challenge_id;
        v_notification := jsonb_build_object('type', 'momentum_surge', 'leader', v_new_leader, 'lead', v_lead);
      end if;
    end;
  end if;
  v_result := jsonb_build_object('points_awarded', v_weight, 'challenger_score', v_challenge.challenger_score,
    'opponent_score', v_challenge.opponent_score, 'notification', v_notification);
  return v_result;
end;
$$;

create or replace function finalise_challenge(p_challenge_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_challenge bar_challenges; v_winner_id uuid; v_loser_id uuid;
begin
  select * into v_challenge from bar_challenges
  where id = p_challenge_id and status = 'live' for update;
  if not found then return jsonb_build_object('error', 'Challenge not live'); end if;
  if v_challenge.challenger_score >= v_challenge.opponent_score then
    v_winner_id := v_challenge.challenger_bar_id; v_loser_id := v_challenge.opponent_bar_id;
  else
    v_winner_id := v_challenge.opponent_bar_id; v_loser_id := v_challenge.challenger_bar_id;
  end if;
  update bar_challenges set status = 'completed', winner_bar_id = v_winner_id,
    forfeit_deadline = now() + interval '24 hours' where id = p_challenge_id;
  update venues set wins = wins + 1, current_streak = greatest(current_streak, 0) + 1 where id = v_winner_id;
  update venues set losses = losses + 1, current_streak = least(current_streak, 0) - 1 where id = v_loser_id;
  insert into veteran_badges (user_id, challenge_id, bar_id, badge_name, won)
  select cp.user_id, p_challenge_id, cp.chosen_bar_id,
    (select name from venues where id = v_winner_id) || ' War ' ||
      (select count(*) + 1 from bar_challenges where status = 'completed'
        and (challenger_bar_id = v_winner_id or opponent_bar_id = v_winner_id))::text,
    cp.chosen_bar_id = v_winner_id
  from challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.was_checked_in = true
  on conflict (user_id, challenge_id) do nothing;
  update challenge_participants set earned_veteran_badge = true
  where challenge_id = p_challenge_id and was_checked_in = true;
  update challenge_participants set consolation_credit_cents = 500
  where challenge_id = p_challenge_id and chosen_bar_id = v_loser_id and was_checked_in = true;
  return jsonb_build_object('winner_bar_id', v_winner_id, 'loser_bar_id', v_loser_id,
    'challenger_score', v_challenge.challenger_score, 'opponent_score', v_challenge.opponent_score,
    'forfeit_deadline', now() + interval '24 hours');
end;
$$;

alter table bar_challenges          enable row level security;
alter table challenge_participants  enable row level security;
alter table challenge_score_events  enable row level security;
alter table challenge_notifications enable row level security;
alter table challenge_battles_boosts enable row level security;
alter table challenge_nominations   enable row level security;
alter table veteran_badges          enable row level security;

create policy "public read challenges" on bar_challenges for select using (status in ('live', 'completed', 'approved'));
create policy "own participant record" on challenge_participants for select using (auth.uid() = user_id);
create policy "read score events" on challenge_score_events for select using (auth.role() = 'authenticated');
create policy "public read boosts" on challenge_battles_boosts for select using (true);
create policy "own nominations" on challenge_nominations for select using (auth.uid() = nominated_by);
create policy "public read badges" on veteran_badges for select using (true);

create index challenges_status_idx     on bar_challenges(status);
create index challenges_window_idx     on bar_challenges(window_start, window_end) where status in ('approved', 'live');
create index challenges_challenger_idx on bar_challenges(challenger_bar_id);
create index challenges_opponent_idx   on bar_challenges(opponent_bar_id);
create index participants_user_idx     on challenge_participants(user_id);
create index nominations_pair_idx      on challenge_nominations(challenger_bar_id, opponent_bar_id);
create index badges_user_idx           on veteran_badges(user_id);