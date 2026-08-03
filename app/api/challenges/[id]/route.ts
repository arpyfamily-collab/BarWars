/**
 * GET /api/challenges/[id]
 *
 * Returns full challenge detail including live scores, participant counts,
 * recent score events, and battle boost status.
 * Public for approved/live/completed. Restricted for proposed/pending.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, resolveRole, ok, err } from '@/lib/challenges'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const service = createServiceClient()

  const { data: challenge, error } = await service
    .from('bar_challenges')
    .select(`
      *,
      challenger:venues!challenger_bar_id(id, name, slug, wins, losses, current_streak),
      opponent:venues!opponent_bar_id(id, name, slug, wins, losses, current_streak),
      winner:venues!winner_bar_id(id, name, slug)
    `)
    .eq('id', params.id)
    .single()

  if (error || !challenge) return err('Challenge not found', 404)

  const publicStatuses = ['approved', 'live', 'completed', 'forfeit_unpaid']

  // Non-public statuses require bar admin or operator auth
  if (!publicStatuses.includes((challenge as any).status)) {
    const { userId, error: authError } = await requireAuth()
    if (authError) return authError

    const role = await resolveRole(userId!)
    const isInvolved =
      role.type === 'operator' ||
      (role.type === 'bar_admin' && (
        role.bar_id === (challenge as any).challenger_bar_id ||
        role.bar_id === (challenge as any).opponent_bar_id
      ))

    if (!isInvolved) return err('Challenge not found', 404) // intentional 404, not 403
  }

  // Participant counts per side
  const { data: participantCounts } = await service
    .from('challenge_participants')
    .select('chosen_bar_id')
    .eq('challenge_id', params.id)

  const counts = (participantCounts ?? []).reduce((acc: Record<string, number>, p: any) => {
    acc[p.chosen_bar_id] = (acc[p.chosen_bar_id] ?? 0) + 1
    return acc
  }, {})

  // Last 10 score events (for momentum log)
  const { data: recentEvents } = await service
    .from('challenge_score_events')
    .select('event_type, points, bar_id, occurred_at, profiles!inner(full_name)')
    .eq('challenge_id', params.id)
    .order('occurred_at', { ascending: false })
    .limit(10)

  // Active battle boost for each bar
  const { data: boosts } = await service
    .from('challenge_battle_boosts')
    .select('*')
    .eq('challenge_id', params.id)
    .gt('expires_at', new Date().toISOString())

  return ok({
    ...challenge,
    participant_counts:     counts,
    recent_score_events:    recentEvents ?? [],
    active_battle_boosts:   boosts ?? [],
  })
}
