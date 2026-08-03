/**
 * POST /api/challenges/[id]/join
 *
 * Patron picks a side in a challenge. Locked after first choice — no switching.
 * Generates a referral code and returns a shareable challenge card payload.
 *
 * Body: { chosen_bar_id: string, referred_by_code?: string }
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  // 2. Parse body
  let body: { chosen_bar_id: string; referred_by_code?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.chosen_bar_id) return err('chosen_bar_id is required')

  const service = createServiceClient()

  // 3. Fetch challenge — must be approved or live
  const { data: challenge } = await service
    .from('bar_challenges')
    .select('id, status, challenger_bar_id, opponent_bar_id, window_end')
    .eq('id', params.id)
    .single()

  if (!challenge) return err('Challenge not found', 404)

  if (!['approved', 'live'].includes((challenge as any).status)) {
    return err('This challenge is not open for participation', 422)
  }

  // 4. Chosen bar must be one of the two combatants
  const { challenger_bar_id, opponent_bar_id } = challenge as any
  if (![challenger_bar_id, opponent_bar_id].includes(body.chosen_bar_id)) {
    return err('chosen_bar_id must be one of the two competing bars')
  }

  // 5. Resolve referral — find who referred this user if a code was provided
  let referredByUserId: string | null = null
  if (body.referred_by_code) {
    const { data: referrer } = await service
      .from('challenge_participants')
      .select('user_id')
      .eq('challenge_id', params.id)
      .eq('referral_code', body.referred_by_code)
      .single()

    if (referrer && (referrer as any).user_id !== userId) {
      referredByUserId = (referrer as any).user_id
    }
  }

  // 6. Insert participant — unique constraint prevents switching sides
  const { data: participant, error: insertError } = await service
    .from('challenge_participants')
    .insert({
      challenge_id:       params.id,
      user_id:            userId,
      chosen_bar_id:      body.chosen_bar_id,
      referred_by_user_id: referredByUserId,
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {  // unique constraint — already joined
      // Return their existing participant record
      const { data: existing } = await service
        .from('challenge_participants')
        .select('*')
        .eq('challenge_id', params.id)
        .eq('user_id', userId!)
        .single()
      return ok({ already_joined: true, participant: existing })
    }
    return err(insertError.message, 500)
  }

  // 7. If a referrer exists and challenge is live, award them a referral score event
  //    (5 pts for bringing someone in — but only if referrer is checked in)
  if (referredByUserId && (challenge as any).status === 'live') {
    const { data: referrerParticipant } = await service
      .from('challenge_participants')
      .select('chosen_bar_id, was_checked_in')
      .eq('challenge_id', params.id)
      .eq('user_id', referredByUserId)
      .single()

    if ((referrerParticipant as any)?.was_checked_in) {
      // Fire score event for the referrer via our API
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/challenges/score`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: params.id,
          bar_id:       (referrerParticipant as any).chosen_bar_id,
          event_type:   'referral_checkin',
          source_ref:   `referral:${userId}:${params.id}`,
        }),
      }).catch(e => console.error('[join] referral score error:', e))
    }
  }

  // 8. Build shareable challenge card payload
  const { data: chosenBar } = await service
    .from('venues').select('name').eq('id', body.chosen_bar_id).single()
  const { data: challenge2 } = await service
    .from('bar_challenges')
    .select('trash_talk, window_start, window_end, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name)')
    .eq('id', params.id)
    .single()

  const shareCard = {
    headline:    `I'm fighting for ${(chosenBar as any)?.name} tonight`,
    subheadline: (challenge2 as any)?.trash_talk,
    window:      (challenge2 as any)?.window_start,
    referral_code: (participant as any)?.referral_code,
    deep_link:   `${process.env.NEXT_PUBLIC_APP_URL}/challenge/${params.id}?ref=${(participant as any)?.referral_code}`,
  }

  return ok({ participant, share_card: shareCard }, 201)
}
