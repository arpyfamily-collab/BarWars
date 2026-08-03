/**
 * GET  /api/challenges  — list challenges (filtered by status, bar, or upcoming)
 * POST /api/challenges  — bar admin proposes a new challenge
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  requireAuth, requireBarAdmin, validateProposal,
  queueAndSendNotification, resolveRole, ok, err,
  type ChallengeProposalPayload,
} from '@/lib/challenges'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')   // filter by status
  const barId   = searchParams.get('bar_id')   // filter by participant bar
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  const service = createServiceClient()

  let query = service
    .from('bar_challenges')
    .select(`
      id, status, trash_talk, stakes_description, scoring_metric,
      window_start, window_end, challenger_score, opponent_score,
      winner_bar_id, forfeit_paid, created_at,
      challenger:venues!challenger_bar_id(id, name, slug, wins, losses),
      opponent:venues!opponent_bar_id(id, name, slug, wins, losses)
    `)
    .order('window_start', { ascending: false })
    .limit(limit)

  // Public-facing: only show approved/live/completed unless caller is operator/admin
  const statusFilter = status
    ? [status]
    : ['approved', 'live', 'completed']

  query = query.in('status', statusFilter)

  if (barId) {
    // Return challenges involving this bar on either side
    query = query.or(`challenger_bar_id.eq.${barId},opponent_bar_id.eq.${barId}`)
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)

  return ok(data)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  // 2. Parse body
  let body: ChallengeProposalPayload
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  // 3. Resolve caller's bar
  const role = await resolveRole(userId!)
  if (role.type !== 'bar_admin' && role.type !== 'operator') {
    return err('Only bar admins can propose challenges', 403)
  }

  // Operators can specify challenger_bar_id explicitly; bar admins use their own bar
  const challengerBarId: string = role.type === 'operator'
    ? (body as any).challenger_bar_id
    : role.bar_id

  if (!challengerBarId) return err('challenger_bar_id required for operator proposals')

  // 4. Authorization — bar admin must administer the challenger bar
  const adminError = await requireBarAdmin(userId!, challengerBarId)
  if (adminError) return adminError

  // 5. Validate payload
  const validationError = validateProposal(body)
  if (validationError) return err(validationError)

  if (challengerBarId === body.opponent_bar_id) {
    return err('A bar cannot challenge itself')
  }

  const service = createServiceClient()

  // 6. Verify opponent bar exists
  const { data: opponentBar } = await service
    .from('venues')
    .select('id, name')
    .eq('id', body.opponent_bar_id)
    .single()

  if (!opponentBar) return err('Opponent bar not found', 404)

  // 7. Check challenger bar isn't already in an overlapping live/approved challenge
  const { data: conflict } = await service
    .from('bar_challenges')
    .select('id')
    .in('status', ['approved', 'live'])
    .or(`challenger_bar_id.eq.${challengerBarId},opponent_bar_id.eq.${challengerBarId}`)
    .gte('window_end', body.window_start)
    .lte('window_start', body.window_end)
    .limit(1)
    .single()

  if (conflict) {
    return err('This bar is already in a challenge during that window', 409)
  }

  // 8. Insert challenge in 'proposed' state
  const { data: challenge, error: insertError } = await service
    .from('bar_challenges')
    .insert({
      challenger_bar_id:  challengerBarId,
      opponent_bar_id:    body.opponent_bar_id,
      status:             'proposed',
      scoring_metric:     body.scoring_metric ?? 'checkins_and_passes',
      score_weights:      body.score_weights  ?? undefined,
      window_start:       body.window_start,
      window_end:         body.window_end,
      trash_talk:         body.trash_talk.trim(),
      stakes_description: body.stakes_description.trim(),
    })
    .select()
    .single()

  if (insertError) return err(insertError.message, 500)

  // 9. Flip to opponent_pending so the rival bar admin can see it
  await service
    .from('bar_challenges')
    .update({ status: 'opponent_pending' })
    .eq('id', (challenge as any).id)

  // 10. Notify rival bar admin
  const { data: challengerBar } = await service
    .from('venues').select('name').eq('id', challengerBarId).single()

  await queueAndSendNotification(
    (challenge as any).id,
    'challenge_proposed',
    'opponent_admin',
    `${(challengerBar as any)?.name ?? 'A bar'} just called you out`,
    `"${body.trash_talk}" — Accept or decline in your dashboard.`,
    `/dashboard/challenges/${(challenge as any).id}`
  )

  return ok({ ...challenge, status: 'opponent_pending' }, 201)
}
