/**
 * POST /api/challenges/[id]/boost
 *
 * Bar admin triggers a Battle Boost — fires a discount/free-entry offer
 * at nearby users who haven't checked in yet.
 * Limited to one active boost per bar per challenge at a time.
 * Duration: 15 minutes, max 50 claims.
 *
 * Body: { boost_type: 'free_entry' | 'discount', discount_cents?: number }
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  requireAuth, requireBarAdmin,
  queueAndSendNotification, ok, err,
} from '@/lib/challenges'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  // 2. Parse body
  let body: { boost_type?: 'free_entry' | 'discount'; discount_cents?: number }
  try { body = await req.json() }
  catch { body = {} }

  const boostType      = body.boost_type     ?? 'free_entry'
  const discountCents  = body.discount_cents ?? 0

  if (boostType === 'discount' && discountCents <= 0) {
    return err('discount_cents must be positive when boost_type is "discount"')
  }

  const service = createServiceClient()

  // 3. Fetch challenge — must be live
  const { data: challenge } = await service
    .from('bar_challenges')
    .select('id, status, challenger_bar_id, opponent_bar_id, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name)')
    .eq('id', params.id)
    .single()

  if (!challenge)                               return err('Challenge not found', 404)
  if ((challenge as any).status !== 'live')     return err('Challenge is not live', 422)

  // 4. Caller must administer one of the two bars
  const { challenger_bar_id, opponent_bar_id } = challenge as any
  let barId: string | null = null

  const challengerCheck = await requireBarAdmin(userId!, challenger_bar_id)
  if (!challengerCheck) barId = challenger_bar_id

  if (!barId) {
    const opponentCheck = await requireBarAdmin(userId!, opponent_bar_id)
    if (!opponentCheck) barId = opponent_bar_id
  }

  if (!barId) return err('Forbidden — not an admin of a bar in this challenge', 403)

  // 5. Enforce one-active-boost-per-bar constraint
  //    (DB has a partial unique index but we give a clear error here)
  const { data: existingBoost } = await service
    .from('challenge_battle_boosts')
    .select('id, expires_at')
    .eq('challenge_id', params.id)
    .eq('bar_id', barId)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (existingBoost) {
    const expiresAt  = new Date((existingBoost as any).expires_at)
    const minsLeft   = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000)
    return err(`Active boost still running — expires in ${minsLeft} min`, 409)
  }

  // 6. Create the boost
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { data: boost, error: boostError } = await service
    .from('challenge_battle_boosts')
    .insert({
      challenge_id:   params.id,
      bar_id:         barId,
      boost_type:     boostType,
      discount_cents: discountCents,
      max_claims:     50,
      claimed:        0,
      expires_at:     expiresAt,
    })
    .select()
    .single()

  if (boostError) return err(boostError.message, 500)

  // 7. Fetch bar name for notification copy
  const { data: bar } = await service
    .from('venues').select('name').eq('id', barId).single()
  const barName = (bar as any)?.name ?? 'The bar'

  const headline = boostType === 'free_entry'
    ? `Free entry at ${barName} — right now`
    : `${barName} just dropped a discount — get in now`

  const body2 = boostType === 'free_entry'
    ? 'First 50 people. 15 minutes. Get there.'
    : `$${(discountCents / 100).toFixed(0)} off entry. 15 minutes. 50 spots.`

  // 8. Fire notification at nearby non-checked-in users
  await queueAndSendNotification(
    params.id,
    'battle_boost',
    'nearby_non_checkins',
    headline,
    body2,
    `/challenge/${params.id}/boost/${(boost as any).id}`
  )

  return ok({
    boost,
    notification: { headline, body: body2 },
    expires_at: expiresAt,
  }, 201)
}
