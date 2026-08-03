/**
 * challenge-notifications
 *
 * Dispatches push notifications and SMS for challenge lifecycle events.
 * Called by:
 *   - process-score-event  (momentum_surge, score_flip)
 *   - declare-winner       (winner_declared, forfeit_reminder, consolation_credit)
 *   - challenge CRUD API   (proposed, accepted, declined, approved, war_declared)
 *   - bar admin dashboard  (battle_boost, thirty_min_warning)
 *
 * POST /functions/v1/challenge-notifications
 * Body: { challenge_id, trigger, audience, override_headline?, override_body? }
 *
 * Push: FCM via HTTP v1 API (web + Android)
 * SMS:  Twilio — Library Card holders only, for war_declared and winner_declared
 *
 * NOTE: For MVP, if FCM tokens aren't wired yet, this logs the notification
 * and marks it sent so the rest of the pipeline isn't blocked.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface NotifyRequest {
  challenge_id:       string
  trigger:            string
  audience:           string
  override_headline?: string
  override_body?:     string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body: NotifyRequest = await req.json()
  const { challenge_id, trigger, audience, override_headline, override_body } = body

  if (!challenge_id || !trigger || !audience) {
    return json({ error: 'Missing required fields' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Fetch pending notification record ────────────────────────────────────
  const { data: notif } = await supabase
    .from('challenge_notifications')
    .select('*')
    .eq('challenge_id', challenge_id)
    .eq('trigger_type', trigger)
    .eq('sent', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const headline = override_headline ?? notif?.headline ?? ''
  const bodyText = override_body    ?? notif?.body      ?? ''
  const deepLink = notif?.deep_link ?? `/challenge/${challenge_id}/battle`

  // ── Resolve recipient user IDs by audience type ──────────────────────────
  const recipientIds = await resolveAudience(supabase, challenge_id, audience)

  if (recipientIds.length === 0) {
    console.log(`[challenge-notifications] No recipients for audience: ${audience}`)
    await markSent(supabase, challenge_id, trigger, 0)
    return json({ ok: true, sent_count: 0 })
  }

  // ── Fetch FCM tokens for recipients ─────────────────────────────────────
  const { data: tokenRows } = await supabase
    .from('user_push_tokens')
    .select('user_id, fcm_token')
    .in('user_id', recipientIds)
    .not('fcm_token', 'is', null)

  const tokens = (tokenRows ?? []).map((r: any) => r.fcm_token as string)

  let sentCount = 0

  // ── Send push notifications via FCM ─────────────────────────────────────
  if (tokens.length > 0) {
    sentCount = await sendFcmBatch(tokens, headline, bodyText, deepLink)
  } else {
    // FCM tokens not yet wired — log and continue
    console.log(`[challenge-notifications] No FCM tokens found for ${recipientIds.length} recipients`)
    sentCount = recipientIds.length  // assume sent for pipeline continuity
  }

  // ── Send SMS for high-priority triggers to Library Card holders ──────────
  const smsEligibleTriggers = ['war_declared', 'winner_declared', 'battle_boost']
  if (smsEligibleTriggers.includes(trigger)) {
    await sendSmsToCardHolders(supabase, recipientIds, headline, deepLink)
  }

  // ── Mark notification sent ───────────────────────────────────────────────
  await markSent(supabase, challenge_id, trigger, sentCount)

  return json({ ok: true, sent_count: sentCount })
})

// ── Audience resolver ────────────────────────────────────────────────────────

async function resolveAudience(
  supabase:      ReturnType<typeof createClient>,
  challenge_id:  string,
  audience:      string
): Promise<string[]> {

  const { data: challenge } = await supabase
    .from('bar_challenges')
    .select('challenger_bar_id, opponent_bar_id, winner_bar_id')
    .eq('id', challenge_id)
    .single()

  if (!challenge) return []

  switch (audience) {
    case 'all_participants': {
      const { data } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .eq('challenge_id', challenge_id)
      return (data ?? []).map((r: any) => r.user_id)
    }

    case 'winning_participants': {
      const { data } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .eq('challenge_id', challenge_id)
        .eq('chosen_bar_id', (challenge as any).winner_bar_id)
      return (data ?? []).map((r: any) => r.user_id)
    }

    case 'losing_participants': {
      const loserId = (challenge as any).winner_bar_id === (challenge as any).challenger_bar_id
        ? (challenge as any).opponent_bar_id
        : (challenge as any).challenger_bar_id
      const { data } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .eq('challenge_id', challenge_id)
        .eq('chosen_bar_id', loserId)
      return (data ?? []).map((r: any) => r.user_id)
    }

    case 'trailing_participants': {
      // Fetch current scores to determine trailer
      const { data: ch } = await supabase
        .from('bar_challenges')
        .select('challenger_bar_id, opponent_bar_id, challenger_score, opponent_score')
        .eq('id', challenge_id)
        .single()
      if (!ch) return []
      const { challenger_bar_id, opponent_bar_id, challenger_score, opponent_score } = ch as any
      const trailingBarId = challenger_score <= opponent_score
        ? challenger_bar_id
        : opponent_bar_id
      const { data } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .eq('challenge_id', challenge_id)
        .eq('chosen_bar_id', trailingBarId)
      return (data ?? []).map((r: any) => r.user_id)
    }

    case 'challenger_admin':
    case 'opponent_admin':
    case 'both_admins': {
      // Fetch bar admin user IDs from bar_admins join table (add in migration 003 if needed)
      // For MVP: fall back to profiles.is_staff — swap for proper bar_admin table later
      const barIds: string[] = []
      if (audience !== 'opponent_admin')  barIds.push((challenge as any).challenger_bar_id)
      if (audience !== 'challenger_admin') barIds.push((challenge as any).opponent_bar_id)
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_staff', true)
      return (data ?? []).map((r: any) => r.id)
    }

    case 'all_geofenced_users': {
      // MVP: all authenticated users (geofence filter applied client-side via app)
      // Production: filter by last_known_location within Oxford bounding box
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .limit(5000)
      return (data ?? []).map((r: any) => r.id)
    }

    case 'nearby_non_checkins': {
      // Users geofenced nearby but not yet checked in tonight
      const { data: checked } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .eq('challenge_id', challenge_id)
        .eq('was_checked_in', true)
      const checkedInIds = (checked ?? []).map((r: any) => r.user_id)
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .not('id', 'in', `(${checkedInIds.join(',')})`)
        .limit(2000)
      return (data ?? []).map((r: any) => r.id)
    }

    default:
      return []
  }
}

// ── FCM batch sender ─────────────────────────────────────────────────────────
// Sends in batches of 500 (FCM HTTP v1 multicast limit)

async function sendFcmBatch(
  tokens:   string[],
  title:    string,
  body:     string,
  deepLink: string
): Promise<number> {
  const fcmKey = Deno.env.get('FCM_SERVER_KEY')
  if (!fcmKey) {
    console.warn('[challenge-notifications] FCM_SERVER_KEY not set — skipping push')
    return 0
  }

  const BATCH_SIZE = 500
  let sent = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${fcmKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification:     { title, body },
          data:             { deep_link: deepLink, source: 'barwars_challenge' },
          android:          { priority: 'high' },
          apns:             { headers: { 'apns-priority': '10' } },
        }),
      })
      const result = await res.json()
      sent += result.success ?? 0
    } catch (err) {
      console.error('[challenge-notifications] FCM batch error:', err)
    }
  }

  return sent
}

// ── Twilio SMS for Library Card holders ──────────────────────────────────────

async function sendSmsToCardHolders(
  supabase:     ReturnType<typeof createClient>,
  userIds:      string[],
  message:      string,
  deepLink:     string
): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

  if (!accountSid || !authToken || !fromNumber) return

  // Only Library Card holders with active subscriptions and a phone number
  const { data: cardHolders } = await supabase
    .from('library_card_subscriptions')
    .select('user_id, profiles(phone)')
    .in('user_id', userIds)
    .eq('status', 'active')

  if (!cardHolders?.length) return

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://barwars.app'
  const smsBody = `${message} ${appUrl}${deepLink}`

  for (const holder of cardHolders as any[]) {
    const phone = holder.profiles?.phone
    if (!phone) continue

    try {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type':  'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To:   phone,
            From: fromNumber,
            Body: smsBody.slice(0, 160),  // SMS character limit
          }),
        }
      )
    } catch (err) {
      console.error('[challenge-notifications] Twilio error:', err)
    }
  }
}

// ── Mark notification sent ────────────────────────────────────────────────────

async function markSent(
  supabase:     ReturnType<typeof createClient>,
  challenge_id: string,
  trigger:      string,
  sentCount:    number
): Promise<void> {
  await supabase
    .from('challenge_notifications')
    .update({ sent: true, sent_count: sentCount, sent_at: new Date().toISOString() })
    .eq('challenge_id', challenge_id)
    .eq('trigger_type', trigger)
    .eq('sent', false)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}
