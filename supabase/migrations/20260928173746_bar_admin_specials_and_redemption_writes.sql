-- Bar Command Center: War Specials and Redemption Offers could never be saved (no write policy).
drop policy if exists "bar admins submit specials" on public.war_specials;
create policy "bar admins submit specials" on public.war_specials for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'submitted'
              and exists (select 1 from public.bar_admins b where b.user_id = auth.uid() and b.bar_id = war_specials.venue_id));
drop policy if exists "bar admins read own offers" on public.war_bond_redemption_offers;
create policy "bar admins read own offers" on public.war_bond_redemption_offers for select to authenticated
  using (exists (select 1 from public.bar_admins b where b.user_id = auth.uid() and b.bar_id = war_bond_redemption_offers.venue_id));
drop policy if exists "bar admins create offers" on public.war_bond_redemption_offers;
create policy "bar admins create offers" on public.war_bond_redemption_offers for insert to authenticated
  with check (coalesce(claimed_count, 0) = 0
              and exists (select 1 from public.bar_admins b where b.user_id = auth.uid() and b.bar_id = war_bond_redemption_offers.venue_id));
drop policy if exists "bar admins toggle offers" on public.war_bond_redemption_offers;
create policy "bar admins toggle offers" on public.war_bond_redemption_offers for update to authenticated
  using (exists (select 1 from public.bar_admins b where b.user_id = auth.uid() and b.bar_id = war_bond_redemption_offers.venue_id))
  with check (exists (select 1 from public.bar_admins b where b.user_id = auth.uid() and b.bar_id = war_bond_redemption_offers.venue_id));
revoke update on public.war_bond_redemption_offers from authenticated;
grant update (active, name, description) on public.war_bond_redemption_offers to authenticated;
