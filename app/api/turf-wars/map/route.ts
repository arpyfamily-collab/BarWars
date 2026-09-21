import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/map — returns threat level + turf holder + coordinates for all bars
 * Public endpoint — drives the interactive Mapbox turf map on the home screen.
 */
export async function GET() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('bar_threat_levels')
    .select('*')
    .order('bar_name', { ascending: true })

  if (error || !data) return ok([])

  // Fetch coordinates from venues table
  const barIds = (data as any[]).map(d => d.bar_id)
  if (barIds.length === 0) return ok([])

  const { data: venues } = await service
    .from('venues')
    .select('id, lat, lon')
    .in('id', barIds)

  const coordMap = new Map((venues ?? []).map((v: any) => [v.id, { lat: parseFloat(v.lat), lng: parseFloat(v.lon) }]))

  // Merge coordinates into the threat data — use `lng` to match Mapbox GL convention
  const merged = (data as any[]).map(bar => ({
    ...bar,
    lat: coordMap.get(bar.bar_id)?.lat ?? null,
    lng: coordMap.get(bar.bar_id)?.lng ?? null,
  }))

  return ok(merged)
}
