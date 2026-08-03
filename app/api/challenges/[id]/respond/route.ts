/**
 * PATCH /api/challenges/[id]/respond
 *
 * Opponent bar admin accepts or declines a challenge.
 * Only callable by an admin of the opponent bar, only when status = 'opponent_pending'.
 *
 * Body: { action: 'accept' | 'decline', decline_reason?: string }
 *
 * accept  → status moves to 'operator_pending', operator notified for review
 * decline → status moves to 'cancelled', challenger admin notified
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  requireAuth, requireBarAdmin,
  queueAndSendNotification, ok, err,
} from '@/lib/challenges'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  // 2. Parse body
  let body: { action: 'accept' | 'decline'; decline_reason?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!['accept', 'decline'].includes(body.action)) {
    return err('action must be "accept" or "decline"')
  }

  const service = createServiceClient()

  // 3. Fetch challenge — must be in opponent_pending state
  const { data: challenge, error: fetchError } = await service
    .from('bar_challenges')
    .select('*, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name)')
    .eq('id', params.id)
    .single()

  if (fetchError || !challenge) return err('Challenge not found', 404)
  if ((challenge as any).status !== 'opponent_pending') {
    return err(`Cannot respond to a challenge in '${(challenge as any).status}' status`, 422)
  }

  // 4. Caller must be an admin of the opponent bar
  const adminError = await requireBarAdmin(userId!, (challenge as any).opponent_bar_id)
  if (adminError) return adminError

  const challengerName = (challenge as any).challenger?.name ?? 'Challenger'
  const opponentName   = (challenge as any).opponent?.name   ?? 'Opponent'

  if (body.action === 'decline') {
    // Cancel the challenge
    await service
      .from('bar_challenges')
      .update({
        status:        'cancelled',
        cancel_reason: body.decline_reason?.trim() ?? 'Declined by opponent',
      })
      .eq('id', params.id)

    // Notify challenger admin
    await queueAndSendNotification(
      params.id,
      'opponent_declined',
      'challenger_admin',
      `${opponentName} declined your challenge`,
      body.decline_reason
        ? `Reason: ${body.decline_reason}`
        : 'No reason given. Try a different bar or adjust the terms.',
      `/dashboard/challenges`
    )

    return ok({ id: params.id, status: 'cancelled' })
  }

  // accept → move to operator_pending
  await service
    .from('bar_challenges')
    .update({ status: 'operator_pending' })
    .eq('id', params.id)

  // Notify challenger admin that opponent accepted
  await queueAndSendNotification(
    params.id,
    'opponent_accepted',
    'challenger_admin',
    `${opponentName} accepted your challenge`,
    'Waiting on platform operator approval. You\'ll hear back soon.',
    `/dashboard/challenges/${params.id}`
  )

  // Notify operator for review
  await queueAndSendNotification(
    params.id,
    'challenge_proposed',   // reusing trigger — operator sees it as a new pending item
    'operator',
    `New challenge pending approval: ${challengerName} vs ${opponentName}`,
    `"${(challenge as any).trash_talk}" — Review in the operator dashboard.`,
    `/operator/challenges/${params.id}`
  )

  return ok({ id: params.id, status: 'operator_pending' })
}
