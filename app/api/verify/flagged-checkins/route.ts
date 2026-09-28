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

  const f = flagged as any
  const { data: checkin } = await service
    .from('turf_checkins')
    .select('claim_id')
    .eq('id', f.checkin_id)
    .maybeSingle()
  const claimId = (checkin as any)?.claim_id

  if (body.action === 'reject' && checkin) {
    // Flagged check-ins never counted until approved, so there is nothing to subtract
    // (the old code decremented a real person's check-in). Remove it and flag the account.
    await service.from('turf_checkins').delete().eq('id', f.checkin_id)
    await service.from('profiles').update({ account_status: 'flagged' }).eq('id', f.user_id)
  }

  // Counts come from the check-in records; approval makes this one count (Testing To-Do item 20)
  if (claimId) await service.rpc('recount_turf_claim', { p_claim: claimId })

  return ok({
    flagged_id: body.flagged_id,
    status: newStatus,
    message: body.action === 'approve'
      ? 'Checkin approved. Headcount counts.'
      : 'Checkin rejected. Headcount reverted and user flagged.',
  })
}
