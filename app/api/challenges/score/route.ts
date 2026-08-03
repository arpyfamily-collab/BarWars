/**
 * POST /api/challenges/score
 *
 * Called by the QR scanner (check-in), pass purchase webhook, and room upgrade.
 * Signs the payload with HMAC before forwarding to the process-score-event
 * edge function, which is the single source of truth for all scoring.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { challenge_id, bar_id, event_type, source_ref } = body

  if (!challenge_id || !bar_id || !event_type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const payload = JSON.stringify({
    challenge_id,
    user_id:    user.id,
    bar_id,
    event_type,
    source_ref: source_ref ?? null,
  })

  // Sign with HMAC so the edge function can verify origin
  const signature = await hmacSign(payload, process.env.SCORE_EVENT_SECRET ?? '')

  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-score-event`

  const res = await fetch(edgeUrl, {
    method:  'POST',
    headers: {
      'Content-Type':          'application/json',
      'Authorization':         `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-barwars-signature':   signature,
    },
    body: payload,
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}
