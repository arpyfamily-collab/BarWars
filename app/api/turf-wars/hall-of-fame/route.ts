import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/hall-of-fame — all-time turf war records
 * Public endpoint.
 */
export async function GET() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('hall_of_fame')
    .select('*')

  if (error) return ok([])
  return ok(data)
}
