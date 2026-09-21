import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, requireOperator, ok, err } from '@/lib/challenges'

/**
 * GET /api/turf-wars/[id] — full detail of a single turf claim
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: claim, error } = await service
    .from('turf_claims')
    .select(`
      id, claim_type, status, window_open_at, window_close_at,
      required_headcount, attacker_verified_headcount, defender_verified_headcount,
      detection_threshold, detected_at, rally_window_minutes, lockout_days,
      cancel_reason, result, created_at,
      attacking_org:greek_orgs!attacking_org_id(name, org_type),
      defending_org:greek_orgs!defending_org_id(name, org_type),
      bar:venues(id, name)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (error) return err(error.message, 500)
  if (!claim) return err('Turf claim not found', 404)

  const { data: checkins } = await service
    .from('turf_checkins')
    .select('org_id, verified_at')
    .eq('claim_id', params.id)
    .order('verified_at', { ascending: false })

  return ok({ ...claim, checkins: checkins ?? [] })
}

/**
 * PATCH /api/turf-wars/[id] — update a turf claim (operator only)
 * Used for live status transitions the operator may need to force.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const opError = await requireOperator(userId!)
  if (opError) return opError

  let body: { status?: string; result?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  const update: Record<string, unknown> = {}
  if (body.status) update.status = body.status
  if (body.result !== undefined) update.result = body.result

  if (Object.keys(update).length === 0) return err('No fields to update')

  const { data, error } = await service
    .from('turf_claims')
    .update(update)
    .eq('id', params.id)
    .select('id, status, result')
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}
