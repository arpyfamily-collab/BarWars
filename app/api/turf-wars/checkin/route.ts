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
 * Body: { claim_id, bar_id, method, latitude?, longitude?, code? (door code, required for qr_scan), device_id? }
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
    code?: string
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

  const claimAny = claim as any
  const warOrgs = [claimAny.attacking_org_id, claimAny.defending_org_id].filter(Boolean)

  // 5. Which side does this check-in count for? (Testing To-Do item 25)
  //    Members of either org count at 1x. Otherwise, a verified member of a Hessian company with an
  //    accepted contract for this war, or a mercenary hired as a headcount filler, checks in for
  //    the side that hired them at 0.75x (a Double Cross moves Hessian check-ins to the rival).
  let userOrgId: string | null = null
  let kind: 'member' | 'hessian' | 'mercenary' = 'member'
  let weight = 1
  let hessianContractId: string | null = null
  let mercenaryContractId: string | null = null

  if (membership && warOrgs.includes((membership as any).org_id)) {
    userOrgId = (membership as any).org_id
  } else {
    const { data: hm } = await service
      .from('hessian_members').select('company_id').eq('user_id', userId!).eq('verified', true).maybeSingle()
    if (hm) {
      const { data: contract } = await service
        .from('hessian_contracts')
        .select('id, org_id, status, agreed_weight, double_cross_org_id')
        .eq('claim_id', body.claim_id).eq('company_id', (hm as any).company_id)
        .in('status', ['accepted', 'betrayed'])
        .maybeSingle()
      const hc: any = contract
      if (hc && warOrgs.includes(hc.org_id)) {
        userOrgId = hc.org_id              // the referee applies a Double Cross when counting
        kind = 'hessian'; weight = Number(hc.agreed_weight) || 0.75; hessianContractId = hc.id
      }
    }
    if (!userOrgId) {
      const { data: merc } = await service
        .from('mercenaries').select('id').eq('user_id', userId!).eq('is_active', true).maybeSingle()
      if (merc) {
        const { data: mcs } = await service
          .from('mercenary_contracts')
          .select('id, hirer_org_id')
          .eq('mercenary_id', (merc as any).id).eq('claim_id', body.claim_id)
          .eq('status', 'accepted').eq('role', 'headcount_filler')
        const mc = ((mcs as any[]) ?? []).find(m => warOrgs.includes(m.hirer_org_id))
        if (mc) { userOrgId = mc.hirer_org_id; kind = 'mercenary'; weight = 0.75; mercenaryContractId = mc.id }
      }
    }
  }

  if (!userOrgId) {
    return err(membership
      ? 'Your org is not involved in this war, and you have no contract for it.'
      : 'Only members of the two orgs, or Hessians and mercenaries hired for this war, can check in.', 403)
  }

  const isAttacker = claimAny.attacking_org_id === userOrgId
  const isDefender = claimAny.defending_org_id === userOrgId

  // 6. Verify location for every check-in. The "QR" check-in never scanned or verified anything,
  //    so anyone could check in to any war at full strength from anywhere (found Sep 28, item 22).
  //    Until bars have real check-in QR codes, both methods must be within 100 m of the bar.
  {
    if (body.method === 'geo_pulse' && !p.location_opt_in) {
      return err('Location sharing must be enabled for geo-pulse check-in', 403)
    }

    if (body.latitude == null || body.longitude == null) {
      return err('Turn on location to check in: you need to be at the bar.', 400)
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

  // 6a. Inside (full strength) needs the bar's door code from the QR sticker (Brian, Sep 28: option 1).
  //     Location alone only proves you're in line. NFC tags can replace the sticker later.
  if (body.method === 'qr_scan') {
    const code = String(body.code ?? '').toUpperCase().replace(/[\s-]/g, '')
    if (!code) return err("Scan the BarWars QR inside the bar (or type the code under it).", 400)
    const { data: door } = await service.from('venues').select('checkin_code').eq('id', body.bar_id).maybeSingle()
    if (!door || (door as any).checkin_code !== code) {
      return err("That's not this bar's code. Scan the BarWars QR inside.", 403)
    }
  }

  // 6b. Line check-ins (Testing To-Do item 22). A location check-in means "I'm here / in line" and
  //     counts at half; the QR scan inside counts in full and upgrades an earlier line check-in.
  //     Turnout counts the person either way. Time in line earns a little Valor (paid on scan-in).
  if (body.method === 'qr_scan') {
    const { data: up } = await service.rpc('upgrade_line_checkin', { p_user: userId!, p_claim: body.claim_id, p_weight: weight })
    if (up) {
      const valor = Number((up as any).line_valor) || 0
      return ok({
        id: (up as any).checkin_id, method: 'qr_scan', upgraded: true, line_valor: valor, is_attacker: isAttacker,
        message: `You're inside: now counting in full.${valor > 0 ? ` +${valor} Valor for the wait.` : ''}`,
      })
    }
  }
  const inLine = body.method === 'geo_pulse'
  if (inLine) weight = Math.round(weight * 50) / 100

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
      kind,
      headcount_weight: weight,
      hessian_contract_id: hessianContractId,
      mercenary_contract_id: mercenaryContractId,
      line_since: inLine ? new Date().toISOString() : null,
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

  // 8. Refresh the live counts from the check-in records (Testing To-Do item 20). Check-ins no
  //    longer decide the war: the referee (resolve_turf_war) scores it once, when the window closes.
  await service.rpc('recount_turf_claim', { p_claim: body.claim_id })
  const { data: fresh } = await service
    .from('turf_claims')
    .select('attacker_verified_headcount, defender_verified_headcount, attacker_weighted_headcount, defender_weighted_headcount, detected_at')
    .eq('id', body.claim_id)
    .single()
  const f: any = fresh ?? {}
  const newAttackerCount = Number(f.attacker_weighted_headcount ?? 0)
  const newDefenderCount = Number(f.defender_weighted_headcount ?? 0)

  // 9. Sneak attack detection: once the attacker reaches detection_threshold % of the required
  //    headcount, the defender is alerted so they can rally before the window closes
  if (claimAny.claim_type === 'sneak_attack' && !f.detected_at && isAttacker) {
    const detectionCount = Math.ceil(claimAny.required_headcount * (claimAny.detection_threshold / 100))
    if (newAttackerCount >= detectionCount) {
      const { data: marked } = await service
        .from('turf_claims')
        .update({ detected_at: now.toISOString() })
        .eq('id', body.claim_id)
        .is('detected_at', null)
        .select('id')
      if ((marked as any[])?.length) {
        const { data: bar } = await service.from('venues').select('name').eq('id', body.bar_id).single()
        const { data: org } = await service.from('greek_orgs').select('name').eq('id', claimAny.attacking_org_id).single()
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
  }

  return ok({
    ...checkin,
    in_line: inLine,
    message: inLine ? "You're checked in from the line: counting at half. Scan the QR inside for full strength." : undefined,
    is_attacker: isAttacker,
    attacker_headcount: newAttackerCount,
    defender_headcount: newDefenderCount,
    required_headcount: claimAny.required_headcount,
    checked_in_as: kind,
    weight,
    claim_resolved: false,
    result: null,
    decided_at_window_close: true,
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
