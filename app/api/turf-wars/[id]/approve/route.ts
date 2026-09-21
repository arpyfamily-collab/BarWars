import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, requireOperator, ok, err } from '@/lib/challenges'

/**
 * PATCH /api/turf-wars/[id]/approve
 *
 * Operator-only endpoint for approving or cancelling a turf claim that
 * requires operator approval (war declarations).
 *
 * Body: { action: 'approve' | 'cancel', cancel_reason?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const opError = await requireOperator(userId!)
  if (opError) return opError

  let body: { action: string; cancel_reason?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.action) return err('action is required')
  if (body.action !== 'approve' && body.action !== 'cancel') {
    return err('action must be "approve" or "cancel"')
  }

  const service = createServiceClient()

  // Fetch the claim
  const { data: claim, error: fetchError } = await service
    .from('turf_claims')
    .select('id, status, claim_type, attacking_org_id, defending_org_id, bar_id, window_open_at')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchError) return err(fetchError.message, 500)
  if (!claim) return err('Turf claim not found', 404)

  if (claim.status !== 'operator_pending') {
    return err(`Claim is in ${claim.status} status — only operator_pending claims can be acted on`, 409)
  }

  if (body.action === 'approve') {
    // Approve: flip to pending (announced, waiting for window to open)
    const { error: updateError } = await service
      .from('turf_claims')
      .update({
        status: 'pending',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    if (updateError) return err(updateError.message, 500)

    // Log a turf event
    const { data: org } = await service
      .from('greek_orgs')
      .select('name')
      .eq('id', claim.attacking_org_id)
      .single()

    const { data: bar } = await service
      .from('venues')
      .select('name')
      .eq('id', claim.bar_id)
      .single()

    await service.from('turf_events').insert({
      claim_id: params.id,
      event_type: 'war_declared',
      org_id: claim.attacking_org_id,
      bar_id: claim.bar_id,
      headline: `${org?.name ?? 'A Greek org'} declared war on ${bar?.name ?? 'a bar'}`,
      body: `War approved by operator. Battle window opens ${new Date(claim.window_open_at).toLocaleString()}.`,
      deep_link: `/turf-wars/${params.id}`,
      visible_to: 'public',
    })

    return ok({ id: params.id, status: 'pending', approved: true })
  }

  // Cancel
  if (!body.cancel_reason?.trim()) {
    return err('cancel_reason is required when cancelling', 400)
  }

  const { error: cancelError } = await service
    .from('turf_claims')
    .update({
      status: 'cancelled',
      cancel_reason: body.cancel_reason.trim(),
    })
    .eq('id', params.id)

  if (cancelError) return err(cancelError.message, 500)

  return ok({ id: params.id, status: 'cancelled', cancelled: true })
}
