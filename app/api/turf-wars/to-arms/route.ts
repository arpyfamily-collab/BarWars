import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/to-arms
 *
 * Sends a "To Arms" push to all verified members of an org during the
 * wait period of a Shots Fired event (after confirmation, before the
 * attack window opens). One push per org per shots fired event.
 *
 * Body: { shot_id: string, side: 'attacker' | 'defender' }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { shot_id: string; side: 'attacker' | 'defender' }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.shot_id) return err('shot_id is required')
  if (!body.side || !['attacker', 'defender'].includes(body.side)) {
    return err('side must be "attacker" or "defender"')
  }

  const service = createServiceClient()

  // Fetch the shots fired record
  const { data: shot, error: shotErr } = await service
    .from('shots_fired')
    .select(`
      id, status, org_id, bar_id,
      attack_window_opens_at, attack_window_closes_at,
      attacker_to_arms_at, defender_to_arms_at,
      org:greek_orgs(name),
      bar:venues(name)
    `)
    .eq('id', body.shot_id)
    .maybeSingle()

  if (shotErr) return err(shotErr.message, 500)
  if (!shot) return err('Shots fired record not found', 404)
  if ((shot as any).status !== 'confirmed') {
    return err('To Arms is only available after the bar admin confirms shots', 422)
  }

  const now = new Date()
  const windowOpens = new Date((shot as any).attack_window_opens_at)

  // Must be in the wait period (after confirmation, before window opens)
  if (now >= windowOpens) {
    return err('The attack window is already open — To Arms is no longer available', 422)
  }

  // Check if this org already sent a To Arms push
  const toArmsField = body.side === 'attacker' ? 'attacker_to_arms_at' : 'defender_to_arms_at'
  if ((shot as any)[toArmsField]) {
    return err('Your org has already sent a To Arms push for this event', 409)
  }

  // Verify the caller is a verified member of the org
  let orgId: string
  if (body.side === 'attacker') {
    orgId = (shot as any).org_id
  } else {
    // Find the defending org (holder of this bar)
    const { data: defender } = await service
      .from('greek_orgs')
      .select('id')
      .eq('home_turf_bar_id', (shot as any).bar_id)
      .maybeSingle()
    if (!defender) return err('No defending org holds this bar', 422)
    orgId = (defender as any).id
  }

  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('org_id', orgId)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified member of this org to send To Arms', 403)

  // Fetch all verified members' push tokens
  const { data: members } = await service
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('verified', true)

  const memberIds = (members ?? []).map((m: any) => m.user_id)
  if (memberIds.length === 0) return err('No verified members to notify', 422)

  const { data: tokenRows } = await service
    .from('user_push_tokens')
    .select('fcm_token')
    .in('user_id', memberIds)
    .not('fcm_token', 'is', null)

  const tokens = (tokenRows ?? []).map((r: any) => r.fcm_token as string)

  const orgName = (shot as any).org?.name ?? 'An org'
  const barName = (shot as any).bar?.name ?? 'a bar'
  const hoursUntilWindow = Math.max(1, Math.ceil((windowOpens.getTime() - now.getTime()) / (60 * 60 * 1000)))

  const title = body.side === 'attacker'
    ? `To Arms — ${barName}`
    : `To Arms — ${orgName} is coming`

  const pushBody = body.side === 'attacker'
    ? `Shots confirmed at ${barName}. Be ready — attack window opens in ~${hoursUntilWindow} hour${hoursUntilWindow > 1 ? 's' : ''}.`
    : `${orgName} fired shots at ${barName}. We defend tonight — who's riding?`

  let pushed = 0
  if (tokens.length > 0) {
    const fcmKey = process.env.FCM_SERVER_KEY
    if (fcmKey) {
      try {
        const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Authorization': `key=${fcmKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registration_ids: tokens.slice(0, 500),
            notification: { title, body: pushBody },
            data: { deep_link: '/turf-wars', source: 'barwars_to_arms' },
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } },
          }),
        })
        if (fcmRes.ok) pushed = tokens.length
      } catch (e) {
        console.error('[to-arms] FCM error:', e)
      }
    }
  }

  // Mark the To Arms as sent
  const updateField = body.side === 'attacker' ? { attacker_to_arms_at: now.toISOString() } : { defender_to_arms_at: now.toISOString() }
  await service
    .from('shots_fired')
    .update(updateField)
    .eq('id', body.shot_id)

  // Log the event
  await service.from('turf_events').insert({
    event_type: 'rally_called',
    org_id: orgId,
    bar_id: (shot as any).bar_id,
    headline: `${body.side === 'attacker' ? orgName : 'Defenders'} called To Arms at ${barName}`,
    body: pushBody,
    deep_link: '/turf-wars',
    visible_to: 'orgs_only',
  })

  return ok({
    shot_id: body.shot_id,
    side: body.side,
    pushed_to: pushed,
    sent_at: now.toISOString(),
  })
}
