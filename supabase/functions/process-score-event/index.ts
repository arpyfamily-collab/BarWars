/**
 * process-score-event
 *
 * Hot path — called on every scoreable patron action during a live challenge.
 * Sources: QR check-in scan, pass purchase webhook, room upgrade.
 *
 * POST /functions/v1/process-score-event
 * Body: { challenge_id, user_id, bar_id, event_type, source_ref? }
 *
 * Flow:
 *   1. Validate request + HMAC signature (prevents spoofed score events)
 *   2. Call record_challenge_score() RPC (atomic, row-locked)
 *   3. If RPC returns a notification signal → invoke challenge-notifications
 *   4. Return updated scores
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VALID_EVENT_TYPES = [
  'checkin',
  'pass_purchase',
  'room_upgrade',
  'drink_purchase',
  'referral_checkin',
] as const

type EventType = typeof VALID_EVENT_TYPES[number]

interface ScoreRequest {
  challenge_id: string
  user_id:      string
  bar_id:       string
  event_type:   EventType
  source_ref?:  string
}

interface RpcResult {
  error?:             string
  points_awarded?:    number
  challenger_score?:  number
  opponent_score?:    number
  notification?:      NotificationSignal | null
}

interface NotificationSignal {
  type:       'score_flip' | 'momentum_surge'
  new_leader?: string
  leader?:    string
  lead?:      number
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-barwars-signature',
      },
    })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Validate HMAC signature ──────────────────────────────────────────────
  // Internal services (pass webhook, QR scanner API) sign requests with
  // HMAC-SHA256(body, SCORE_EVENT_SECRET). Reject unsigned requests.
  const signature   = req.headers.get('x-barwars-signature')
  const rawBody     = await req.text()
  const secret      = Deno.env.get('SCORE_EVENT_SECRET') ?? ''

  if (secret) {
    const expected = await hmacSign(rawBody, secret)
    if (signature !== expected) {
      return json({ error: 'Invalid signature' }, 401)
    }
  }

  // ── Parse + validate body ────────────────────────────────────────────────
  let body: ScoreRequest
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { challenge_id, user_id, bar_id, event_type, source_ref } = body

  if (!challenge_id || !user_id || !bar_id || !event_type) {
    return json({ error: 'Missing required fields' }, 400)
  }

  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return json({ error: `Invalid event_type: ${event_type}` }, 400)
  }

  // ── Supabase service client ──────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Call atomic RPC ──────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('record_challenge_score', {
    p_challenge_id: challenge_id,
    p_user_id:      user_id,
    p_bar_id:       bar_id,
    p_event_type:   event_type,
    p_source_ref:   source_ref ?? null,
  })

  if (error) {
    console.error('[process-score-event] RPC error:', error)
    return json({ error: error.message }, 500)
  }

  const result = data as RpcResult

  if (result.error) {
    // RPC returned a domain error (duplicate, not live, wrong bar, etc.)
    const statusCode = result.error.includes('Duplicate') ? 409
      : result.error.includes('not live')                 ? 422
      : 400
    return json({ error: result.error }, statusCode)
  }

  // ── Fire notification if RPC signalled one ───────────────────────────────
  if (result.notification) {
    await dispatchNotification(challenge_id, result.notification, supabase)
  }

  return json({
    ok:               true,
    points_awarded:   result.points_awarded,
    challenger_score: result.challenger_score,
    opponent_score:   result.opponent_score,
  })
})

// ── Notification dispatcher ──────────────────────────────────────────────────

async function dispatchNotification(
  challenge_id:   string,
  signal:         NotificationSignal,
  supabase:       ReturnType<typeof createClient>
) {
  try {
    // Fetch challenge + bar names for notification copy
    const { data: challenge } = await supabase
      .from('bar_challenges')
      .select('*, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name)')
      .eq('id', challenge_id)
      .single()

    if (!challenge) return

    const challengerName = (challenge as any).challenger?.name ?? 'Challenger'
    const opponentName   = (challenge as any).opponent?.name   ?? 'Opponent'

    let headline = ''
    let body     = ''
    let audience = ''
    let trigger  = ''

    if (signal.type === 'score_flip') {
      const newLeaderName = signal.new_leader === challenge.challenger_bar_id
        ? challengerName
        : opponentName

      headline = `${newLeaderName} just took the lead!`
      body     = `The score just flipped. Get there now.`
      audience = 'all_participants'
      trigger  = 'score_flip'
    }

    if (signal.type === 'momentum_surge') {
      const leaderName = signal.leader === challenge.challenger_bar_id
        ? challengerName
        : opponentName
      const trailerName = signal.leader === challenge.challenger_bar_id
        ? opponentName
        : challengerName

      headline = `${leaderName} went on a run`
      body     = `${trailerName} is down ${signal.lead} pts. Get there.`
      audience = 'trailing_participants'
      trigger  = 'momentum_surge'
    }

    if (!headline) return

    // Write notification record
    await supabase.from('challenge_notifications').insert({
      challenge_id,
      trigger_type: trigger,
      audience,
      headline,
      body,
      deep_link:    `/challenge/${challenge_id}/battle`,
      scheduled_at: new Date().toISOString(),
    })

    // Invoke challenge-notifications function (fire-and-forget)
    const notifUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/challenge-notifications`
    fetch(notifUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ challenge_id, trigger, audience }),
    }).catch(err => console.error('[process-score-event] notification dispatch error:', err))

  } catch (err) {
    // Don't let notification failure kill the score response
    console.error('[process-score-event] notification error:', err)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc     = new TextEncoder()
  const key     = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                 'application/json',
      'Access-Control-Allow-Origin':  '*',
    },
  })
}
