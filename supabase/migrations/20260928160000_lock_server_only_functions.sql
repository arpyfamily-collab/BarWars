-- BarWars: last item of the Sep 28 security batch.
-- Stat counters and anti-abuse checks are server-only: the app calls them from API routes and
-- edge functions with the service role, so players (signed in or not) can't run them directly.
do $r$
declare f text;
begin
  foreach f in array array[
    'increment_shots_fired_count(uuid)', 'increment_sneak_attack_defended(uuid)', 'increment_sneak_attack_launched(uuid)',
    'increment_sneak_attack_repelled(uuid)', 'increment_turf_loss(uuid)', 'increment_turf_win(uuid)',
    'increment_war_lost(uuid)', 'increment_war_won(uuid)',
    'check_device_eligibility(uuid, text)', 'check_event_eligibility(uuid, text)', 'flag_burner_account(uuid)',
    'reserve_pass(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $r$;

-- Staff-only setters already check the caller is staff; signed-out callers have no business here
revoke all on function public.set_age_verified(uuid, boolean) from public, anon;
revoke all on function public.set_staff_status(uuid, boolean) from public, anon;
grant execute on function public.set_age_verified(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_staff_status(uuid, boolean) to authenticated, service_role;
