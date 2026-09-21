/*
# Turf Wars Phase 2 — RPC Helper Functions

Small atomic increment functions used by the check-in and shots fired API routes
to update Greek org stats safely.
*/

create or replace function increment_shots_fired_count(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set shots_fired_count = shots_fired_count + 1 where id = p_org_id;
end;
$$;

create or replace function increment_turf_win(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set
    turf_wins = turf_wins + 1,
    longest_turf_streak_weeks = greatest(longest_turf_streak_weeks, turf_streak_weeks)
  where id = p_org_id;
end;
$$;

create or replace function increment_turf_loss(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set turf_losses = turf_losses + 1 where id = p_org_id;
end;
$$;

create or replace function increment_sneak_attack_repelled(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set
    sneak_attacks_launched = sneak_attacks_launched + 1,
    sneak_attacks_repelled = sneak_attacks_repelled + 1
  where id = p_org_id;
end;
$$;

create or replace function increment_sneak_attack_defended(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set sneak_attacks_repelled = sneak_attacks_repelled + 1 where id = p_org_id;
end;
$$;

create or replace function increment_sneak_attack_launched(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set sneak_attacks_launched = sneak_attacks_launched + 1 where id = p_org_id;
end;
$$;

create or replace function increment_war_won(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set wars_won = wars_won + 1 where id = p_org_id;
end;
$$;

create or replace function increment_war_lost(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  update greek_orgs set wars_lost = wars_lost + 1 where id = p_org_id;
end;
$$;

grant execute on function increment_shots_fired_count(uuid) to authenticated;
grant execute on function increment_turf_win(uuid) to authenticated;
grant execute on function increment_turf_loss(uuid) to authenticated;
grant execute on function increment_sneak_attack_repelled(uuid) to authenticated;
grant execute on function increment_sneak_attack_defended(uuid) to authenticated;
grant execute on function increment_sneak_attack_launched(uuid) to authenticated;
grant execute on function increment_war_won(uuid) to authenticated;
grant execute on function increment_war_lost(uuid) to authenticated;