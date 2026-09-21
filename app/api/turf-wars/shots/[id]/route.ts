import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * PATCH /api/turf-wars/shots/[id]
 *
 * Bar admin confirms or denies shots fired at their bar.
 * Operator can also expire a shots fired record (stand down).
 *
 * Body: { action: 'confirm' | 'deny' | 'expire' }
 *
 * On confirm:
 * - Attack window opens 1-3 hours after confirmation (compressed from 2-6)
 * - BUT the window cannot open sooner than 4 hours after the shots were filed
 *   (advance notice requirement for bar staffing)
 * - Window is 90 minutes long
 * - Bar admin receives advance notice push
 * - Defending org is notified with full announced identity
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { action: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.action) return err('action is required')
  if (!['confirm', 'deny', 'expire'].includes(body.action)) {
    return err('action must be "confirm", "deny", or "expire"')
  }

  const service = createServiceClient()

  const { data: shot, error: fetchError } = await service
    .from('shots_fired')
    .select('id, status, bar_id, org_id, created_at, surge_fee_cents')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchError) return err(fetchError.message, 500)
  if (!shot) return err('Shots fired record not found', 404)

  if (shot.status !== 'pending_confirmation' && body.action !== 'expire') {
    return err(`Cannot ${body.action} — record is in ${shot.status} status`, 409)
  }

  // Check authorization — bar admin or operator
  const { data: barAdmin } = await service
    .from('bar_admins')
    .select('bar_id')
    .eq('user_id', userId!)
    .eq('bar_id', (shot as any).bar_id)
    .maybeSingle()

  const { data: profile } = await service
    .from('profiles')
    .select('is_staff')
    .eq('id', userId!)
    .maybeSingle()

  const isBarAdmin = !!barAdmin
  const isOperator = profile?.is_staff === true

  if (!isBarAdmin && !isOperator) {
    return err('Only bar admins or operators can confirm or expire shots', 403)
  }

  if (body.action === 'confirm') {
    const now = new Date()
    const filedAt = new Date((shot as any).created_at)

    // Compressed timing: window opens 1-3 hours after confirmation
    const randomDelayMinutes = 60 + Math.floor(Math.random() * 120) // 60-180 min (1-3 hours)
    const confirmedWindowOpens = new Date(now.getTime() + randomDelayMinutes * 60_000)

    // Advance notice floor: window cannot open sooner than 4 hours after filing
    const fourHoursAfterFiling = new Date(filedAt.getTime() + 4 * 60 * 60 * 1000)
    const windowOpens = confirmedWindowOpens < fourHoursAfterFiling
      ? fourHoursAfterFiling
      : confirmedWindowOpens
    const windowCloses = new Date(windowOpens.getTime() + 90 * 60_000) // 90 min window

    const { error: updateError } = await service
      .from('shots_fired')
      .update({
        status: 'confirmed',
        confirmed_by: userId,
        confirmed_at: now.toISOString(),
        attack_window_opens_at: windowOpens.toISOString(),
        attack_window_closes_at: windowCloses.toISOString(),
      })
      .eq('id', params.id)

    if (updateError) return err(updateError.message, 500)

    // Fetch org and bar names for the intel drop
    const { data: org } = await service
      .from('greek_orgs')
      .select('name')
      .eq('id', (shot as any).org_id)
      .single()

    const { data: bar } = await service
      .from('venues')
      .select('name')
      .eq('id', (shot as any).bar_id)
      .single()

    const orgName = org?.name ?? 'An org'
    const barName = bar?.name ?? 'a bar'

    // Public intel drop — announced identity, threat level flips
    await service.from('turf_events').insert({
      event_type: 'sneak_attack_detected',
      org_id: (shot as any).org_id,
      bar_id: (shot as any).bar_id,
      headline: `Shots confirmed at ${barName}`,
      body: `${orgName} fired shots. Attack window opens in 1-3 hours. Rally your people.`,
      deep_link: `/turf-wars`,
      visible_to: 'public',
    })

    // Find the defending org (the org that currently holds this bar)
    const { data: defender } = await service
      .from('greek_orgs')
      .select('id, name')
      .eq('home_turf_bar_id', (shot as any).bar_id)
      .maybeSingle()

    // Send push to defending org members
    if (defender) {
      const { data: members } = await service
        .from('org_memberships')
        .select('user_id')
        .eq('org_id', (defender as any).id)
        .eq('verified', true)

      const memberIds = (members ?? []).map((m: any) => m.user_id)
      if (memberIds.length > 0) {
        const { data: tokenRows } = await service
          .from('user_push_tokens')
          .select('fcm_token')
          .in('user_id', memberIds)
          .not('fcm_token', 'is', null)

        const tokens = (tokenRows ?? []).map((r: any) => r.fcm_token as string)
        if (tokens.length > 0) {
          const fcmKey = process.env.FCM_SERVER_KEY
          if (fcmKey) {
            try {
              await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                  'Authorization': `key=${fcmKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  registration_ids: tokens.slice(0, 500),
                  notification: {
                    title: `Shots fired at ${barName}`,
                    body: `${orgName} is coming. Rally your people now.`,
                  },
                  data: { deep_link: '/turf-wars', source: 'barwars_shots_fired' },
                  android: { priority: 'high' },
                  apns: { headers: { 'apns-priority': '10' } },
                }),
              })
            } catch (e) {
              console.error('[shots-fired] FCM error:', e)
            }
          }
        }
      }
    }

    // Send advance notice push to bar admin(s)
    const { data: barAdmins } = await service
      .from('bar_admins')
      .select('user_id')
      .eq('bar_id', (shot as any).bar_id)

    const adminIds = (barAdmins ?? []).map((a: any) => a.user_id)
    if (adminIds.length > 0) {
      const { data: adminTokens } = await service
        .from('user_push_tokens')
        .select('fcm_token')
        .in('user_id', adminIds)
        .not('fcm_token', 'is', null)

      const adminPushTokens = (adminTokens ?? []).map((r: any) => r.fcm_token as string)
      if (adminPushTokens.length > 0) {
        const fcmKey = process.env.FCM_SERVER_KEY
        if (fcmKey) {
          try {
            await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Authorization': `key=${fcmKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                registration_ids: adminPushTokens.slice(0, 500),
                notification: {
                  title: `Shots confirmed at ${barName}`,
                  body: `${orgName} has declared a potential sneak attack. Earliest window: ${windowOpens.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Expect elevated traffic.`,
                },
                data: { deep_link: '/dashboard/turf', source: 'barwars_shots_confirmed' },
                android: { priority: 'high' },
                apns: { headers: { 'apns-priority': '10' } },
              }),
            })
          } catch (e) {
            console.error('[shots-fired] bar admin FCM error:', e)
          }
        }
      }
    }

    return ok({
      id: params.id,
      status: 'confirmed',
      attack_window_opens_at: windowOpens.toISOString(),
      attack_window_closes_at: windowCloses.toISOString(),
      defender_notified: !!defender,
      advance_notice_sent: adminIds.length > 0,
    })
  }

  if (body.action === 'deny') {
    // Deny = mark as stand_down (bar says this didn't happen)
    // If a surge fee was paid, refund 100% on deny (bar declined to participate)
    const surgeFee = (shot as any).surge_fee_cents ?? 0
    const { error: updateError } = await service
      .from('shots_fired')
      .update({
        status: 'stand_down',
        surge_fee_refunded_cents: surgeFee,
      })
      .eq('id', params.id)

    if (updateError) return err(updateError.message, 500)
    return ok({ id: params.id, status: 'stand_down', surge_fee_refunded_cents: surgeFee })
  }

  // Expire — auto stand down (attacker never launched)
  // Surge fee refund: 50% returned to org, 50% kept by bar
  const surgeFee = (shot as any).surge_fee_cents ?? 0
  const refundAmount = Math.floor(surgeFee * 0.5)

  const { error: expireError } = await service
    .from('shots_fired')
    .update({
      status: 'expired',
      surge_fee_refunded_cents: refundAmount,
    })
    .eq('id', params.id)

  if (expireError) return err(expireError.message, 500)

  // Fetch names for the stand-down event
  const { data: orgData } = await service
    .from('greek_orgs')
    .select('name')
    .eq('id', (shot as any).org_id)
    .single()

  const { data: barData } = await service
    .from('venues')
    .select('name')
    .eq('id', (shot as any).bar_id)
    .single()

  await service.from('turf_events').insert({
    event_type: 'rally_called',
    bar_id: (shot as any).bar_id,
    headline: `Stand down — ${orgData?.name ?? 'An org'} backed off at ${barData?.name ?? 'a bar'}`,
    body: 'No attack followed the shots fired. The bar is no longer under threat.',
    deep_link: '/turf-wars',
    visible_to: 'public',
  })

  return ok({
    id: params.id,
    status: 'expired',
    surge_fee_refunded_cents: refundAmount,
    surge_fee_kept_by_bar: surgeFee - refundAmount,
  })
}
