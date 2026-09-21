import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/feed
 * Public endpoint — returns recent turf war events for the battle feed.
 * Joins bar name, attacking org name, and rival (defending) org name.
 */
export async function GET() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('turf_events')
    .select(`
      id, event_type, headline, created_at,
      org_id, bar_id,
      bar:venues!turf_events_bar_id_fkey(name),
      org:greek_orgs!turf_events_org_id_fkey(name),
      claim:turf_claims!turf_events_claim_id_fkey(
        defending_org_id,
        defending_org:greek_orgs!turf_claims_defending_org_id_fkey(name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error || !data) return ok([])

  const mapped = (data as any[]).map(e => ({
    id: e.id,
    event_type: e.event_type,
    bar_name: e.bar?.name ?? 'Unknown bar',
    org_name: e.org?.name ?? null,
    rival_org_name: e.claim?.defending_org?.name ?? null,
    created_at: e.created_at,
  }))

  return ok(mapped)
}
