-- "org_admin read members" queried org_memberships from inside its own policy, so every direct
-- player read of org_memberships failed with "infinite recursion". is_org_leader() is security
-- definer and does the same check without recursing. The new leadership_alerts policy uses it too.
drop policy if exists "org_admin read members" on public.org_memberships;
create policy "org_admin read members" on public.org_memberships for select to authenticated
  using (public.is_org_leader(org_id));

drop policy if exists "org leaders read their alerts" on public.leadership_alerts;
create policy "org leaders read their alerts" on public.leadership_alerts for select to authenticated
  using (public.is_org_leader(org_id));
