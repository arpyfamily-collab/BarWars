/**
 * bracelet-scan
 *
 * Called when a signed-in player scans or types a bracelet's QR code.
 * The player is the signed-in user from the Authorization header (their session token);
 * any user_id in the body is ignored.
 *
 * POST { qr_token, action: null | 'keep' | 'donate' }
 *
 * action null     → looks up the bracelet, returns offer info (no state change)
 * action 'keep'   → marks the bracelet kept by the player
 * action 'donate' → marks it donated, puts it in the Armory, credits 25 Valor and the
 *                   Quartermaster badge (all in one database transaction: bracelet_found)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Who is scanning: the signed-in user, never a user_id from the request body
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    const userId = auth?.user?.id
    if (authError || !userId) return json({ error: 'Please sign in to scan bracelets.' }, 401)

    const { qr_token, action } = await req.json()
    const qr = typeof qr_token === 'string' ? qr_token.trim() : ''
    if (!UUID.test(qr)) return json({ error: 'Invalid bracelet code' }, 404)

    if (!action) {
      const { data: bracelet } = await supabase
        .from('bracelet_drops')
        .select('id, venue_id, status, offer_type, offer_value, venues:venue_id(name)')
        .eq('qr_token', qr)
        .maybeSingle()

      if (!bracelet) return json({ error: 'Invalid bracelet code' }, 404)
      if (bracelet.status !== 'hidden') {
        return json({
          error: 'This bracelet has already been found',
          bracelet: { id: bracelet.id, status: bracelet.status, offer_value: bracelet.offer_value },
        }, 410)
      }
      return json({
        bracelet: {
          id: bracelet.id,
          venue_id: bracelet.venue_id,
          offer_type: bracelet.offer_type,
          offer_value: bracelet.offer_value,
          bar_name: (bracelet as any).venues?.name,
        },
      })
    }

    if (action !== 'keep' && action !== 'donate') return json({ error: 'Invalid action' }, 400)

    const { data, error } = await supabase.rpc('bracelet_found', {
      p_user: userId,
      p_qr: qr,
      p_action: action,
    })

    if (error) {
      if ((error.message || '').includes('ALREADY_FOUND')) return json({ error: 'Someone else grabbed it first' }, 409)
      return json({ error: 'Could not process that bracelet. Try again.' }, 500)
    }

    const r = data as any
    return json({
      success: true,
      bracelet: { id: r.id, status: r.status, offer_value: r.offer_value, bar_name: r.bar_name },
      action,
      armory_id: r.armory_id ?? null,
      valor_bonds: r.valor_bonds ?? 0,
      badge: action === 'donate' ? 'Quartermaster' : null,
    })
  } catch (_err) {
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
})
