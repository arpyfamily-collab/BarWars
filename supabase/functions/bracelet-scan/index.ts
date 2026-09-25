/**
 * bracelet-scan
 *
 * Called when a student scans/types a QR token from a hidden bracelet.
 *
 * POST { qr_token, user_id, action: null | 'keep' | 'donate' }
 *
 * action null   → looks up the bracelet, returns offer info (no state change)
 * action 'keep' → marks bracelet as 'kept', sets found_by/found_at
 * action 'donate' → marks bracelet as 'donated', sets found_by/found_at,
 *                   inserts an armory row, awards 25 Valor Bonds
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const { qr_token, user_id, action } = await req.json()

    if (!qr_token || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing qr_token or user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Look up the bracelet by QR token
    const { data: bracelet, error: lookupError } = await supabase
      .from('bracelet_drops')
      .select(`
        id, venue_id, qr_token, status, offer_type, offer_value,
        clue_1, clue_2, clue_3, found_by, found_at,
        venues:venue_id(name)
      `)
      .eq('qr_token', qr_token)
      .maybeSingle()

    if (lookupError || !bracelet) {
      return new Response(
        JSON.stringify({ error: 'Invalid bracelet code' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If already found, return its current state
    if (bracelet.status !== 'hidden') {
      return new Response(
        JSON.stringify({
          error: 'This bracelet has already been found',
          bracelet: { id: bracelet.id, status: bracelet.status, offer_value: bracelet.offer_value },
        }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // action null — just return info
    if (!action) {
      return new Response(
        JSON.stringify({
          bracelet: {
            id: bracelet.id,
            venue_id: bracelet.venue_id,
            offer_type: bracelet.offer_type,
            offer_value: bracelet.offer_value,
            bar_name: bracelet.venues?.name,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action !== 'keep' && action !== 'donate') {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newStatus = action === 'keep' ? 'kept' : 'donated'
    const now = new Date().toISOString()

    // Atomically claim the bracelet
    const { data: claimed, error: claimError } = await supabase
      .from('bracelet_drops')
      .update({
        status: newStatus,
        found_by: user_id,
        found_at: now,
      })
      .eq('id', bracelet.id)
      .eq('status', 'hidden')
      .select('id, status, offer_value, venue_id')
      .single()

    if (claimError || !claimed) {
      return new Response(
        JSON.stringify({ error: 'Someone else grabbed it first' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let armoryId: string | null = null
    let valorBonds = 0

    if (action === 'donate') {
      // Insert into armory
      const { data: armoryRow, error: armoryError } = await supabase
        .from('armory')
        .insert({
          donor_user_id: user_id,
          current_venue_id: bracelet.venue_id,
          bracelet_drop_id: bracelet.id,
          offer_type: bracelet.offer_type,
          offer_value: bracelet.offer_value,
          status: 'available',
        })
        .select('id')
        .single()

      armoryId = armoryRow?.id ?? null
      valorBonds = 25
    }

    return new Response(
      JSON.stringify({
        success: true,
        bracelet: {
          id: claimed.id,
          status: claimed.status,
          offer_value: claimed.offer_value,
          bar_name: bracelet.venues?.name,
        },
        action,
        armory_id: armoryId,
        valor_bonds: valorBonds,
        badge: action === 'donate' ? 'Quartermaster' : null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
