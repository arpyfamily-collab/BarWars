import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Bar Challenge notifications. Sends due notifications to a challenge's participants.
 * Sep 29 (item 17): pushes go through the app's sender (/api/push/internal: Apple for iPhones, Firebase
 * for Android). The old code used Google's legacy API, shut down in 2024, so nothing was delivered.
 * Also: only servers can call this now (a valid Supabase service key); before, anyone could trigger it.
 */
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.barwars.app'

async function isServiceKey(key: string): Promise<boolean> {
  if (!key) return false
  const own = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (own && key === own) return true
  // Accept either key format: ask Supabase whether this key has admin rights
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  return r.ok
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!(await isServiceKey(bearer))) return json({ error: 'unauthorized' }, 401)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } })

  const { challenge_id } = await req.json().catch(() => ({}))
  if (!challenge_id) return json({ error: 'Missing challenge_id' }, 400)

  const { data: unsent } = await supabase
    .from('challenge_notifications')
    .select('*')
    .eq('challenge_id', challenge_id)
    .eq('sent', false)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')

  let sentCount = 0
  for (const notif of unsent ?? []) {
    const { data: participants } = await supabase.from('challenge_participants').select('user_id').eq('challenge_id', challenge_id)
    const userIds = (participants ?? []).map((p: any) => p.user_id)
    let delivered = 0
    if (userIds.length) {
      try {
        const r = await fetch(`${APP_URL}/api/push/internal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ user_ids: userIds, title: notif.headline, body: notif.body ?? '', data: { type: 'challenge', url: notif.deep_link ?? `/challenge/${challenge_id}` } }),
        })
        const out = await r.json().catch(() => ({}))
        if (!r.ok) console.error('push_internal_failed', { status: r.status, error: out?.error })
        delivered = out?.sent ?? 0
      } catch (e) { console.error('push_internal_error', String(e)) }
    }
    // sent_count = devices actually reached (was: number of participants, whether or not anything went out)
    await supabase.from('challenge_notifications')
      .update({ sent: true, sent_at: new Date().toISOString(), sent_count: delivered })
      .eq('id', notif.id)
    sentCount++
  }
  return json({ ok: true, sent: sentCount })
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
