import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getHandledAssetIds } from '@/lib/spy-handlers'

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

  // Assets the caller handles as org leader or Hessian captain (no identities)
  const handledIds = await getHandledAssetIds(service, userId!)
  let handledAssets: any[] = []
  if (handledIds.length > 0) {
    const { data } = await service
      .from('spy_assets')
      .select('id, spy_type, is_active, burned, created_at')
      .in('id', handledIds)
      .eq('is_active', true)
    handledAssets = (data as any[]) ?? []
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
