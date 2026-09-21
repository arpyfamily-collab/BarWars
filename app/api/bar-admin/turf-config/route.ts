import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bar-admin/turf-config — fetch turf config for the caller's bar
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: barAdmin } = await service
    .from('bar_admins')
    .select('bar_id')
    .eq('user_id', userId!)
    .maybeSingle()

  if (!barAdmin) return err('You are not a bar admin', 403)

  const { data: bar, error } = await service
    .from('venues')
    .select('id, name, turf_enabled, turf_claim_headcount_pct, turf_maintenance_headcount_pct, turf_sneak_attack_headcount_pct, turf_shots_min, turf_sneak_attack_nights, turf_war_nights, turf_maintenance_nights_required, turf_surge_fee_cents')
    .eq('id', (barAdmin as any).bar_id)
    .single()

  if (error) return err(error.message, 500)
  return ok(bar)
}

/**
 * PATCH /api/bar-admin/turf-config — update turf config
 */
export async function PATCH(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  const { data: barAdmin } = await service
    .from('bar_admins')
    .select('bar_id')
    .eq('user_id', userId!)
    .maybeSingle()

  if (!barAdmin) return err('You are not a bar admin', 403)

  const update: Record<string, unknown> = {}
  const allowed = [
    'turf_enabled', 'turf_claim_headcount_pct', 'turf_maintenance_headcount_pct',
    'turf_sneak_attack_headcount_pct', 'turf_shots_min', 'turf_sneak_attack_nights',
    'turf_war_nights', 'turf_maintenance_nights_required', 'turf_surge_fee_cents',
  ]
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  if (Object.keys(update).length === 0) return err('No fields to update')

  const { data, error } = await service
    .from('venues')
    .update(update)
    .eq('id', (barAdmin as any).bar_id)
    .select('id, name, turf_enabled')
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}
