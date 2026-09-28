import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/alerts
 * Private leadership alerts (e.g. loyalty alerts) for orgs the caller leads as a verified admin.
 * Never names the member involved.
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const service = createServiceClient()

  const { data: led } = await service
    .from('org_memberships').select('org_id').eq('user_id', userId!).eq('verified', true).eq('role', 'admin')
  const orgIds = ((led as any[]) ?? []).map(m => m.org_id)
  if (orgIds.length === 0) return ok([])

  const { data } = await service
    .from('leadership_alerts')
    .select('id, kind, headline, body, created_at')
    .in('org_id', orgIds)
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  return ok((data as any[]) ?? [])
}
