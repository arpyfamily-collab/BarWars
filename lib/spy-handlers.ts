import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which handler sides the caller leads. Until intel cells exist (To-Do item 12),
 * only an org leader (verified org_memberships.role = 'admin') or a Hessian captain
 * handles moles and reads their intel. Decided by Brian, Sep 28, 2026.
 */
export async function getLedHandlers(service: SupabaseClient, userId: string) {
  const { data: led } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('verified', true)
    .eq('role', 'admin')

  const { data: companies } = await service
    .from('hessian_companies')
    .select('id')
    .eq('captain_id', userId)

  return {
    orgIds: ((led as any[]) ?? []).map(m => m.org_id as string),
    companyIds: ((companies as any[]) ?? []).map(c => c.id as string),
  }
}

/** Ids of the spy assets the caller handles as a leader. Never returns who the assets are. */
export async function getHandledAssetIds(service: SupabaseClient, userId: string): Promise<string[]> {
  const { orgIds, companyIds } = await getLedHandlers(service, userId)
  const ids: string[] = []
  if (orgIds.length > 0) {
    const { data } = await service.from('spy_assets').select('id').in('handler_org_id', orgIds)
    ids.push(...((data as any[]) ?? []).map(a => a.id))
  }
  if (companyIds.length > 0) {
    const { data } = await service.from('spy_assets').select('id').in('handler_company_id', companyIds)
    ids.push(...((data as any[]) ?? []).map(a => a.id))
  }
  return Array.from(new Set(ids))
}
