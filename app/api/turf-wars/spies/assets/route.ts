import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/assets
 * Returns the caller's spy assets (as the asset) and assets they manage (as handler).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  // Assets where caller is the spy
  const { data: myAssets } = await service
    .from('spy_assets')
    .select('id, spy_type, handler_type, is_active, burned, burned_at, created_at')
    .eq('asset_user_id', userId!)

  // Assets where caller is the handler (org)
  const { data: orgMemberships } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)

  const orgIds = ((orgMemberships as any[]) ?? []).map(m => m.org_id)
  let handledAssets: any[] = []

  if (orgIds.length > 0) {
    const { data } = await service
      .from('spy_assets')
      .select('id, spy_type, is_active, burned, created_at')
      .in('handler_org_id', orgIds)
      .eq('is_active', true)
    handledAssets = [...((data as any[]) ?? [])]
  }

  // Assets where caller is the handler (Hessian company)
  const { data: myCompany } = await service
    .from('hessian_companies')
    .select('id')
    .eq('captain_id', userId!)
    .maybeSingle()

  if (myCompany) {
    const { data: companyAssets } = await service
      .from('spy_assets')
      .select('id, spy_type, is_active, burned, created_at')
      .eq('handler_company_id', (myCompany as any).id)
      .eq('is_active', true)
    handledAssets = [...handledAssets, ...((companyAssets as any[]) ?? [])]
  }

  // Also get pending recruitments and badges
  const { data: badges } = await service
    .from('spy_badges')
    .select('id, badge_type, awarded_at, detail')
    .eq('user_id', userId!)

  return ok({
    myAssets: (myAssets as any[]) ?? [],
    handledAssets,
    badges: (badges as any[]) ?? [],
  })
}
