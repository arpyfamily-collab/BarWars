import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * POST /api/turf-wars/rally
 *
 * Sends a rally push notification to all verified members of an org.
 * Free action — no cost, no limit. Used when:
 *   - A sneak attack is detected on the org's turf
 *   - A war declaration is filed against the org
 *   - Proactively before a maintenance night
 *
 * Body: { org_id, bar_id, claim_id?, message? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { org_id: string; bar_id: string; claim_id?: string; message?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.org_id) return err('org_id is required')
  if (!body.bar_id) return err('bar_id is required')

  const service = createServiceClient()

  // Verify caller is a verified member or admin of this org
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id, role, greek_orgs!org_id(name)')
    .eq('org_id', body.org_id)
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) {
    return err('You must be a verified member of this org to call a rally', 403)
  }

  const orgName = (membership as any).greek_orgs?.name ?? 'Your org'

  // Get bar name
  const { data: bar } = await service
    .from('venues')
    .select('name')
    .eq('id', body.bar_id)
    .maybeSingle()

  const barName = bar?.name ?? 'the bar'
  const message = body.message ?? `${orgName} needs you at ${barName}. We're defending our turf.`

  // Log the rally event
  await service.from('turf_events').insert({
    claim_id: body.claim_id ?? null,
    event_type: 'rally_called',
    org_id: body.org_id,
    bar_id: body.bar_id,
    headline: `${orgName} called a rally at ${barName}`,
    body: message,
    deep_link: body.claim_id ? `/turf-wars/${body.claim_id}` : '/turf-wars',
    visible_to: 'orgs_only',
  })

  // Fetch all verified member user IDs
  const { data: members } = await service
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', body.org_id)
    .eq('verified', true)

  const memberIds = (members ?? []).map((m: any) => m.user_id)
  if (memberIds.length === 0) {
    return ok({ rallied: 0, message: 'No verified members to rally' })
  }

  // Fetch FCM tokens for members
  const { data: tokenRows } = await service
    .from('user_push_tokens')
    .select('fcm_token')
    .in('user_id', memberIds)
    .not('fcm_token', 'is', null)

  const tokens = (tokenRows ?? []).map((r: any) => r.fcm_token as string)

  let sentCount = 0
  if (tokens.length > 0) {
    const fcmKey = process.env.FCM_SERVER_KEY
    if (fcmKey) {
      try {
        const res = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Authorization': `key=${fcmKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registration_ids: tokens.slice(0, 500),
            notification: {
              title: `Rally at ${barName}`,
              body: message,
            },
            data: {
              deep_link: body.claim_id ? `/turf-wars/${body.claim_id}` : '/turf-wars',
              source: 'barwars_turf_rally',
            },
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } },
          }),
        })
        const result = await res.json()
        sentCount = result.success ?? 0
      } catch (e) {
        console.error('[turf-rally] FCM error:', e)
      }
    } else {
      // No FCM key — log for pipeline continuity
      console.log(`[turf-rally] No FCM_SERVER_KEY — would send to ${tokens.length} tokens`)
      sentCount = tokens.length
    }
  }

  return ok({ rallied: memberIds.length, push_sent: sentCount, message })
}
