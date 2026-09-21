import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/allies/checkin
 *
 * Ally check-in during an active claim window. Works like a normal check-in
 * but with weighted headcount (0.5x for allies, 0.75x for national brothers).
 * If the claim is a rush event, the ally earns a Rush Credential.
 *
 * Body: { claim_id, bar_id, ally_id, method, latitude?, longitude? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    claim_id: string
    bar_id: string
    ally_id: string
    method: 'qr_scan' | 'geo_pulse'
    latitude?: number
    longitude?: number
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.claim_id) return err('claim_id is required')
  if (!body.bar_id) return err('bar_id is required')
  if (!body.ally_id) return err('ally_id is required')
  if (!body.method || !['qr_scan', 'geo_pulse'].includes(body.method)) {
    return err('method must be "qr_scan" or "geo_pulse"')
  }

  const service = createServiceClient()

  // 1. Fetch the ally record — must belong to this user
  const { data: ally, error: allyErr } = await service
    .from('allies')
    .select('id, org_id, claim_id, headcount_weight, national_brother, rush_credential_earned')
    .eq('id', body.ally_id)
    .eq('user_id', userId!)
    .maybeSingle()

  if (allyErr) return err(allyErr.message, 500)
  if (!ally) return err('Ally record not found for this user', 404)

  const allyAny = ally as any

  // 2. Fetch the claim and verify it's live
  const { data: claim, error: claimError } = await service
    .from('turf_claims')
    .select(`
      id, status, claim_type, window_open_at, window_close_at,
      attacking_org_id, defending_org_id, bar_id,
      required_headcount, attacker_verified_headcount, defender_verified_headcount,
      attacker_weighted_headcount, defender_weighted_headcount
    `)
    .eq('id', body.claim_id)
    .maybeSingle()

  if (claimError) return err(claimError.message, 500)
  if (!claim) return err('Turf claim not found', 404)

  const claimAny = claim as any

  if (claimAny.status !== 'live') {
    return err('This turf claim is not currently live', 422)
  }

  // 3. Verify within time window
  const now = new Date()
  const windowOpen = new Date(claimAny.window_open_at)
  const windowClose = new Date(claimAny.window_close_at)
  if (now < windowOpen) return err('The claim window has not opened yet', 422)
  if (now > windowClose) return err('The claim window has closed', 422)

  // 4. Verify bar matches
  if (claimAny.bar_id !== body.bar_id) {
    return err('This check-in does not match the claim bar', 422)
  }

  // 5. Verify the ally's org is involved (attacker or defender)
  const isAttacker = claimAny.attacking_org_id === allyAny.org_id
  const isDefender = claimAny.defending_org_id === allyAny.org_id
  if (!isAttacker && !isDefender) {
    return err('Your ally org is not involved in this turf claim', 403)
  }

  // 6. Geo-pulse verification
  if (body.method === 'geo_pulse') {
    if (body.latitude == null || body.longitude == null) {
      return err('latitude and longitude are required for geo-pulse check-in', 400)
    }
    const { data: bar } = await service
      .from('venues')
      .select('lat, lon')
      .eq('id', body.bar_id)
      .maybeSingle()

    if (bar?.lat && bar?.lon) {
      const distance = haversineDistance(body.latitude!, body.longitude!, bar.lat, bar.lon)
      if (distance > 100) {
        return err(`You are ${Math.round(distance)}m from the bar — must be within 100m`, 422)
      }
    }
  }

  // 7. Insert the check-in with weighted headcount
  const weight = parseFloat(allyAny.headcount_weight) || 0.5
  const { data: checkin, error: insertError } = await service
    .from('turf_checkins')
    .insert({
      claim_id: body.claim_id,
      user_id: userId,
      org_id: allyAny.org_id,
      bar_id: body.bar_id,
      method: body.method,
      ally_id: body.ally_id,
      headcount_weight: weight,
    })
    .select('id, verified_at, method, headcount_weight')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return err('You have already checked in for this claim', 409)
    }
    return err(insertError.message, 500)
  }

  // 8. Update the claim's weighted headcount counters
  const currentWeighted = isAttacker
    ? parseFloat(claimAny.attacker_weighted_headcount) || 0
    : parseFloat(claimAny.defender_weighted_headcount) || 0
  const newWeighted = currentWeighted + weight

  // Also increment the integer headcount by 1 (for display — shows total bodies)
  const currentInt = isAttacker
    ? claimAny.attacker_verified_headcount
    : claimAny.defender_verified_headcount
  const newInt = currentInt + 1

  const updateData: Record<string, unknown> = {
    [isAttacker ? 'attacker_verified_headcount' : 'defender_verified_headcount']: newInt,
    [isAttacker ? 'attacker_weighted_headcount' : 'defender_weighted_headcount']: newWeighted,
  }

  // 9. Check if this is a rush event — if so, award Rush Credential
  const { data: rushEvent } = await service
    .from('rush_events')
    .select('id, is_rush_event')
    .eq('claim_id', body.claim_id)
    .eq('org_id', allyAny.org_id)
    .maybeSingle()

  let rushCredentialEarned = false
  if (rushEvent && (rushEvent as any).is_rush_event) {
    rushCredentialEarned = true
    await service
      .from('allies')
      .update({ rush_credential_earned: true })
      .eq('id', body.ally_id)
  }

  // 10. Check if claim is resolved (using weighted headcount for attacker threshold)
  let claimResolved = false
  let resultMessage: string | null = null

  if (isAttacker && newWeighted >= claimAny.required_headcount) {
    const defenderWeighted = parseFloat(claimAny.defender_weighted_headcount) || 0
    if (defenderWeighted < newWeighted) {
      claimResolved = true
      resultMessage = 'Attacker reached required headcount. Attack successful.'
      updateData.status = 'successful'
      updateData.result = resultMessage

      // Transfer turf
      await service
        .from('greek_orgs')
        .update({
          home_turf_bar_id: body.bar_id,
          turf_claimed_at: now.toISOString(),
          turf_streak_weeks: 1,
        })
        .eq('id', claimAny.attacking_org_id)

      if (claimAny.defending_org_id) {
        await service
          .from('greek_orgs')
          .update({ home_turf_bar_id: null, turf_claimed_at: null, turf_streak_weeks: 0 })
          .eq('id', claimAny.defending_org_id)
      }

      await service.rpc('increment_turf_win', { p_org_id: claimAny.attacking_org_id }).maybeSingle()
      if (claimAny.defending_org_id) {
        await service.rpc('increment_turf_loss', { p_org_id: claimAny.defending_org_id }).maybeSingle()
      }
    } else {
      updateData.status = 'contested'
      updateData.result = 'Both orgs reached headcount thresholds. Contest continues until window closes.'
    }
  }

  await service
    .from('turf_claims')
    .update(updateData)
    .eq('id', body.claim_id)

  return ok({
    ...checkin,
    is_attacker: isAttacker,
    headcount_weight: weight,
    rush_credential_earned: rushCredentialEarned,
    attacker_headcount: newInt,
    defender_headcount: isAttacker ? claimAny.defender_verified_headcount : newInt,
    attacker_weighted: isAttacker ? newWeighted : parseFloat(claimAny.attacker_weighted_headcount),
    defender_weighted: isAttacker ? parseFloat(claimAny.defender_weighted_headcount) : newWeighted,
    required_headcount: claimAny.required_headcount,
    claim_resolved: claimResolved,
    result: resultMessage,
  }, 201)
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
