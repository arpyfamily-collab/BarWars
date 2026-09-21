import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/verify/flagged-checkins
 * Operator-only: returns pending flagged checkins for review.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  // Verify caller is staff
  const { data: profile } = await service
    .from('profiles')
    .select('is_staff')
    .eq('id', userId!)
    .maybeSingle()

  if (!profile || !(profile as any).is_staff) {
    return err('Operator access required', 403)
  }

  const { data, error } = await service
    .from('flagged_checkins')
    .select(`
      id, flag_reason, status, created_at, resolved_at,
      user_id, claim_id, bar_id,
      bar:venues(name),
      checkin:turf_checkins(method, created_at)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/verify/flagged-checkins
 * Operator-only: approve or reject a flagged checkin.
 * Body: { flagged_id, action: 'approve' | 'reject' }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { flagged_id: string; action: 'approve' | 'reject' }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.flagged_id || !['approve', 'reject'].includes(body.action)) {
    return err('flagged_id and action (approve/reject) required')
  }

  const service = createServiceClient()

  // Verify caller is staff
  const { data: profile } = await service
    .from('profiles')
    .select('is_staff')
    .eq('id', userId!)
    .maybeSingle()

  if (!profile || !(profile as any).is_staff) {
    return err('Operator access required', 403)
  }

  const { data: flagged } = await service
    .from('flagged_checkins')
    .select('id, status, checkin_id, user_id')
    .eq('id', body.flagged_id)
    .maybeSingle()

  if (!flagged) return err('Flagged checkin not found', 404)
  if ((flagged as any).status !== 'pending') return err('Already resolved', 409)

  const now = new Date().toISOString()
  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'

  await service
    .from('flagged_checkins')
    .update({ status: newStatus, reviewed_by: userId!, resolved_at: now })
    .eq('id', body.flagged_id)

  if (body.action === 'reject') {
    // Revert the headcount increment from this checkin
    const f = flagged as any
    const { data: checkin } = await service
      .from('turf_checkins')
      .select('claim_id, org_id, bar_id')
      .eq('id', f.checkin_id)
      .maybeSingle()

    if (checkin) {
      const c = checkin as any
      // Decrement the headcount
      const { data: claim } = await service
        .from('turf_claims')
        .select('attacker_org_id, defender_org_id, attacker_verified_headcount, defender_verified_headcount')
        .eq('id', c.claim_id)
        .maybeSingle()

      if (claim) {
        const cl = claim as any
        if (cl.attacker_org_id === c.org_id) {
          await service
            .from('turf_claims')
            .update({ attacker_verified_headcount: Math.max(0, cl.attacker_verified_headcount - 1) })
            .eq('id', c.claim_id)
        } else {
          await service
            .from('turf_claims')
            .update({ defender_verified_headcount: Math.max(0, cl.defender_verified_headcount - 1) })
            .eq('id', c.claim_id)
        }
      }

      // Remove the checkin
      await service
        .from('turf_checkins')
        .delete()
        .eq('id', f.checkin_id)

      // Flag the user's account
      await service
        .from('profiles')
        .update({ account_status: 'flagged' })
        .eq('id', f.user_id)
    }
  }

  return ok({
    flagged_id: body.flagged_id,
    status: newStatus,
    message: body.action === 'approve'
      ? 'Checkin approved. Headcount counts.'
      : 'Checkin rejected. Headcount reverted and user flagged.',
  })
}
