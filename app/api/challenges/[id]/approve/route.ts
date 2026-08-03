/**
 * PATCH /api/challenges/[id]/approve
 *
 * Platform operator approves, modifies, or cancels a challenge.
 * Only callable by operator (profiles.is_staff = true).
 * Only valid when status = 'operator_pending'.
 *
 * Body:
 *   { action: 'approve' }
 *   { action: 'approve', modifications: { trash_talk?, stakes_description?, score_weights? } }
 *   { action: 'cancel', cancel_reason: string }
 *
 * approve → status = 'approved', both bar admins notified, war_declared notification
 *           scheduled for window_start (handled by declare-winner cron)
 * cancel  → status = 'cancelled', both bar admins notified with reason
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  requireAuth, requireOperator,
  queueAndSendNotification, ok, err,
} from '@/lib/challenges'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth — operator only
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const operatorError = await requireOperator(userId!)
  if (operatorError) return operatorError

  // 2. Parse body
  let body: {
    action:          'approve' | 'cancel'
    cancel_reason?:  string
    modifications?:  {
      trash_talk?:         string
      stakes_description?: string
      score_weights?:      Record<string, number>
    }
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!['approve', 'cancel'].includes(body.action)) {
    return err('action must be "approve" or "cancel"')
  }

  const service = createServiceClient()

  // 3. Fetch challenge
  const { data: challenge } = await service
    .from('bar_challenges')
    .select('*, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name)')
    .eq('id', params.id)
    .single()

  if (!challenge) return err('Challenge not found', 404)
  if ((challenge as any).status !== 'operator_pending') {
    return err(`Cannot approve/cancel a challenge in '${(challenge as any).status}' status`, 422)
  }

  const challengerName = (challenge as any).challenger?.name ?? 'Challenger'
  const opponentName   = (challenge as any).opponent?.name   ?? 'Opponent'
  const windowStart    = new Date((challenge as any).window_start)
  const windowStartStr = windowStart.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  // ── CANCEL ──────────────────────────────────────────────────────────────────
  if (body.action === 'cancel') {
    if (!body.cancel_reason?.trim()) {
      return err('cancel_reason is required when cancelling')
    }

    await service
      .from('bar_challenges')
      .update({
        status:        'cancelled',
        cancel_reason: body.cancel_reason.trim(),
      })
      .eq('id', params.id)

    await queueAndSendNotification(
      params.id,
      'opponent_declined',   // reusing — "declined" reads correctly for both bars
      'both_admins',
      'Your challenge was not approved',
      `Reason: ${body.cancel_reason}`,
      `/dashboard/challenges`
    )

    return ok({ id: params.id, status: 'cancelled', reason: body.cancel_reason })
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────────

  // Apply any operator modifications before approval
  const updates: Record<string, unknown> = {
    status:       'approved',
    approved_by:  userId,
    approved_at:  new Date().toISOString(),
  }

  if (body.modifications?.trash_talk) {
    const trimmed = body.modifications.trash_talk.trim()
    if (trimmed.length > 120) return err('Modified trash_talk exceeds 120 characters')
    updates.trash_talk = trimmed
  }

  if (body.modifications?.stakes_description) {
    updates.stakes_description = body.modifications.stakes_description.trim()
  }

  if (body.modifications?.score_weights) {
    // Validate all weight values are positive integers
    const weights = body.modifications.score_weights
    for (const [key, val] of Object.entries(weights)) {
      if (!Number.isInteger(val) || val < 0) {
        return err(`score_weights.${key} must be a non-negative integer`)
      }
    }
    updates.score_weights = {
      ...(challenge as any).score_weights,
      ...weights,
    }
  }

  await service
    .from('bar_challenges')
    .update(updates)
    .eq('id', params.id)

  // Notify both bar admins — challenge is approved and scheduled
  await queueAndSendNotification(
    params.id,
    'operator_approved',
    'both_admins',
    `The war is approved: ${challengerName} vs ${opponentName}`,
    `Starts ${windowStartStr}. Prepare your staff and your trash talk.`,
    `/dashboard/challenges/${params.id}`
  )

  // Queue the war_declared notification — declare-winner cron will flip
  // the challenge to 'live' at window_start and fire this notification then.
  // We insert it now so it's ready; sent=false keeps it from firing early.
  await service.from('challenge_notifications').insert({
    challenge_id:  params.id,
    trigger_type:  'war_declared',
    audience:      'all_geofenced_users',
    headline:      `WAR: ${challengerName} vs ${opponentName}`,
    body:          (challenge as any).trash_talk,
    deep_link:     `/challenge/${params.id}`,
    scheduled_at:  (challenge as any).window_start,  // fires at battle start, not now
    sent:          false,
  })

  const wasModified = !!body.modifications && Object.keys(body.modifications).length > 0

  return ok({
    id:           params.id,
    status:       'approved',
    was_modified: wasModified,
    window_start: (challenge as any).window_start,
    modifications: wasModified ? body.modifications : null,
  })
}
