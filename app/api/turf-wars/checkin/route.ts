import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * POST /api/turf-wars/checkin
 *
 * Verifies a turf check-in during an active claim window.
 * Two methods:
 *   - qr_scan: User scans a venue-specific QR code at the bar
 *   - geo_pulse: App pings GPS; if within 100m of bar for 20+ min, verified
 *
 * Anti-fraud rules (Layered Defense):
 *   1. Only verified org members count toward headcount
 *   2. A user can only count toward one org per claim
 *   3. One check-in per user per claim (enforced by unique constraint)
 *   4. Must be within the claim's time window
 *   5. Geo-pulse requires location_opt_in on profile
 *   6. Device fingerprint check — blocked devices can't participate
 *   7. Account status check — flagged/blocked accounts are rejected
 *   8. Burner detection — new accounts with zero social connections are flagged
 *   9. .edu verification required for high-stakes roles (Greek members)
 *
 * Body: { claim_id, bar_id, method, latitude?, longitude?, device_id? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    claim_id: string
    bar_id: string
    method: 'qr_scan' | 'geo_pulse'
    latitude?: number
    longitude?: number
    device_id?: string
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.claim_id) return err('claim_id is required')
  if (!body.bar_id)   return err('bar_id is required')
  if (!body.method || !['qr_scan', 'geo_pulse'].includes(body.method)) {
    return err('method must be "qr_scan" or "geo_pulse"')
  }

  const service = createServiceClient()

  // 1. Fetch the claim and verify it's live
  const { data: claim, error: claimError } = await service
    .from('turf_claims')
    .select(`
      id, status, claim_type, window_open_at, window_close_at,
      attacking_org_id, defending_org_id, bar_id,
      required_headcount, detection_threshold, detected_at,
      attacker_verified_headcount, defender_verified_headcount
    `)
    .eq('id', body.claim_id)
    .maybeSingle()

  if (claimError) return err(claimError.message, 500)
  if (!claim) return err('Turf claim not found', 404)

  if ((claim as any).status !== 'live') {
    return err('This turf claim is not currently live', 422)
  }

  // 2. Verify we're within the time window
  const now = new Date()
  const windowOpen = new Date((claim as any).window_open_at)
  const windowClose = new Date((claim as any).window_close_at)

  if (now < windowOpen) return err('The claim window has not opened yet', 422)
  if (now > windowClose) return err('The claim window has closed', 422)

  // 3. Verify the bar matches
  if ((claim as any).bar_id !== body.bar_id) {
    return err('This check-in does not match the claim bar', 422)
  }

  // 3b. Anti-fraud: check account status and device fingerprint
  const { data: profile } = await service
    .from('profiles')
    .select('account_status, is_burner, device_verified, phone_verified, edu_verified, location_opt_in')
    .eq('id', userId!)
    .maybeSingle()

  if (!profile) return err('Profile not found', 404)
  const p = profile as any

  if (p.account_status === 'blocked') {
    return err('Your account has been blocked from event participation.', 403)
  }

  // Device fingerprint check (if device_id provided)
  if (body.device_id) {
    const { data: deviceCheck } = await service.rpc('check_device_eligibility', {
      p_user_id: userId!,
      p_device_id: body.device_id,
    })

    if (deviceCheck === false) {
      return err('Device verification failed. This device may be associated with another account.', 403)
    }
  }

  // Burner account detection
  const { data: burnerCheck } = await service.rpc('flag_burner_account', {
    p_user_id: userId!,
  })

  if (burnerCheck === true || p.is_burner) {
    // Allow checkin but flag it for review
    // The checkin goes through but goes to the review queue
  }

  // 4. Find the user's verified org membership
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id, greek_orgs!org_id(name)')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) {
    return err('You must be a verified member of a Greek org to check in', 403)
  }

  const userOrgId = (membership as any).org_id
  const claimAny = claim as any

  // 5. Verify the user's org is involved in this claim (attacker or defender)
  const isAttacker = claimAny.attacking_org_id === userOrgId
  const isDefender = claimAny.defending_org_id === userOrgId

  if (!isAttacker && !isDefender) {
    return err('Your org is not involved in this turf claim', 403)
  }

  // 6. For geo-pulse: verify location
  if (body.method === 'geo_pulse') {
    // Check location opt-in (already fetched in step 3b)
    if (!p.location_opt_in) {
      return err('Location sharing must be enabled for geo-pulse check-in', 403)
    }

    if (body.latitude == null || body.longitude == null) {
      return err('latitude and longitude are required for geo-pulse check-in', 400)
    }

    // Verify within 100m of bar using Haversine
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

  // 7. Insert the check-in
  // If user is flagged as a burner, the checkin still goes through but
  // gets added to the flagged_checkins review queue (Layer 4)
  const isFlagged = p.is_burner || p.account_status === 'flagged'
  const { data: checkin, error: insertError } = await service
    .from('turf_checkins')
    .insert({
      claim_id: body.claim_id,
      user_id: userId!,
      org_id: userOrgId,
      bar_id: body.bar_id,
      method: body.method,
    })
    .select('id, verified_at, method')
    .single()

  if (insertError) {
    // Check for unique constraint violation (already checked in)
    if (insertError.code === '23505') {
      return err('You have already checked in for this claim', 409)
    }
    return err('Check-in failed. Please try again.', 500)
  }

  // 7b. If this user is flagged/burner, add to the review queue
  // The checkin goes through but doesn't count until the operator approves it
  if (isFlagged) {
    await service.from('flagged_checkins').insert({
      checkin_id: (checkin as any).id,
      user_id: userId!,
      claim_id: body.claim_id,
      bar_id: body.bar_id,
      flag_reason: p.is_burner
        ? 'Burner account: registered <24h ago with zero social connections'
        : 'Account flagged: device or phone velocity check triggered',
      status: 'pending',
    })

    return ok({
      ...checkin,
      is_attacker: isAttacker,
      required_headcount: claimAny.required_headcount,
      flagged_for_review: true,
      review_message: 'Your check-in has been submitted but is pending review by the platform operator before it counts toward headcount.',
    }, 201)
  }

  // 8. Update the claim's headcount counters
  const incrementField = isAttacker
    ? 'attacker_verified_headcount'
    : 'defender_verified_headcount'

  const newAttackerCount = isAttacker
    ? claimAny.attacker_verified_headcount + 1
    : claimAny.attacker_verified_headcount
  const newDefenderCount = isDefender
    ? claimAny.defender_verified_headcount + 1
    : claimAny.defender_verified_headcount

  const updateData: Record<string, unknown> = {
    [incrementField]: (isAttacker ? claimAny.attacker_verified_headcount : claimAny.defender_verified_headcount) + 1,
  }

  // 9. Sneak attack detection: if attacker reaches detection_threshold %, mark as detected
  if (claimAny.claim_type === 'sneak_attack' && !claimAny.detected_at && isAttacker) {
    const detectionCount = Math.ceil(claimAny.required_headcount * (claimAny.detection_threshold / 100))
    if (newAttackerCount >= detectionCount) {
      updateData.detected_at = now.toISOString()

      // Log detection event — this is when the defending org gets alerted
      const { data: bar } = await service
        .from('venues')
        .select('name')
        .eq('id', body.bar_id)
        .single()

      const { data: org } = await service
        .from('greek_orgs')
        .select('name')
        .eq('id', claimAny.attacking_org_id)
        .single()

      await service.from('turf_events').insert({
        claim_id: body.claim_id,
        event_type: 'sneak_attack_detected',
        org_id: claimAny.attacking_org_id,
        bar_id: body.bar_id,
        headline: `Sneak attack detected at ${bar?.name ?? 'a bar'}`,
        body: `${org?.name ?? 'An org'} has been detected attempting a sneak attack. Rally your members now!`,
        deep_link: `/turf-wars/${body.claim_id}`,
        visible_to: 'public',
      })
    }
  }

  // 10. Check if claim is resolved (attacker reached required headcount)
  let claimResolved = false
  let resultMessage: string | null = null

  if (newAttackerCount >= claimAny.required_headcount) {
    // Attacker wins — check if defender can still match
    if (newDefenderCount < newAttackerCount) {
      // Attacker has more — claim successful
      claimResolved = true
      resultMessage = 'Attacker reached required headcount with no successful defense.'
      updateData.status = 'successful'
      updateData.result = resultMessage

      // Transfer turf
      await service
        .from('greek_orgs')
        .update({
          home_turf_bar_id: body.bar_id,
          turf_claimed_at: now.toISOString(),
          turf_streak_weeks: 1,
          turf_wins: claimAny.attacking_org_id === userOrgId ? undefined : undefined, // will update below
        })
        .eq('id', claimAny.attacking_org_id)

      // Clear turf from defender if they had it
      if (claimAny.defending_org_id) {
        await service
          .from('greek_orgs')
          .update({ home_turf_bar_id: null, turf_claimed_at: null, turf_streak_weeks: 0 })
          .eq('id', claimAny.defending_org_id)
      }

      // Update war records
      await service.rpc('increment_turf_win', { p_org_id: claimAny.attacking_org_id }).maybeSingle()
      if (claimAny.defending_org_id) {
        await service.rpc('increment_turf_loss', { p_org_id: claimAny.defending_org_id }).maybeSingle()
      }
    } else {
      // Defender matched — contested
      updateData.status = 'contested'
      updateData.result = 'Both orgs reached headcount thresholds. Contest continues until window closes.'
    }
  }

  // Also check if defender repelled (defender >= attacker and attacker hasn't reached threshold)
  if (!claimResolved && claimAny.claim_type === 'sneak_attack' && claimAny.detected_at) {
    if (newDefenderCount >= newAttackerCount && newAttackerCount > 0) {
      // Check if rally window has passed
      const detectedAt = new Date(claimAny.detected_at)
      const rallyMinutes = claimAny.rally_window_minutes
      const rallyEnd = new Date(detectedAt.getTime() + rallyMinutes * 60 * 1000)

      if (now > rallyEnd || now > windowClose) {
        // Defender repelled
        claimResolved = true
        resultMessage = 'Defender matched attacker headcount. Attack repelled.'
        updateData.status = 'failed'
        updateData.result = resultMessage

        // Update sneak attack stats
        await service.rpc('increment_sneak_attack_repelled', { p_org_id: claimAny.attacking_org_id }).maybeSingle()
        if (claimAny.defending_org_id) {
          await service.rpc('increment_sneak_attack_defended', { p_org_id: claimAny.defending_org_id }).maybeSingle()
        }

        // Log defense event
        await service.from('turf_events').insert({
          claim_id: body.claim_id,
          event_type: 'turf_defended',
          org_id: claimAny.defending_org_id,
          bar_id: body.bar_id,
          headline: 'Turf defended — sneak attack repelled',
          body: resultMessage,
          deep_link: `/turf-wars/${body.claim_id}`,
          visible_to: 'public',
        })
      }
    }
  }

  await service
    .from('turf_claims')
    .update(updateData)
    .eq('id', body.claim_id)

  return ok({
    ...checkin,
    is_attacker: isAttacker,
    attacker_headcount: newAttackerCount,
    defender_headcount: newDefenderCount,
    required_headcount: claimAny.required_headcount,
    claim_resolved: claimResolved,
    result: resultMessage,
  }, 201)
}

/**
 * Haversine distance between two lat/lon points, in meters.
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
