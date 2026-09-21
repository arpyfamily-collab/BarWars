import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/badges
 * Returns spy badges for a user (public — display credentials).
 * ?user_id=xxx for a specific user, defaults to caller.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('user_id') ?? userId

  const service = createServiceClient()

  const { data, error } = await service
    .from('spy_badges')
    .select('id, badge_type, awarded_at, detail')
    .eq('user_id', targetUserId!)
    .order('awarded_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
}
