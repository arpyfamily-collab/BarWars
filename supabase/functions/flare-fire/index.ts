/**
 * flare-fire
 *
 * Called by bar managers to fire a flare at their venue.
 *
 * POST { venue_id, fired_by, offer_text, discount_desc, duration_min }
 *
 * Checks:
 *   1. The venue exists
 *   2. No flare has been fired in the last 4 hours (cooldown)
 *   3. The venue has flare credits available (balance > 0)
 *
 * On success: inserts a new flare row and decrements the balance
 *             in flare_credits for the current week.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

function getMondayStr(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const { venue_id, fired_by, offer_text, discount_desc, duration_min } = await req.json()

    if (!venue_id || !fired_by || !offer_text || !discount_desc) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Check cooldown — last flare within 4 hours?
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    const { data: recentFlare } = await supabase
      .from('flares')
      .select('id, fired_at')
      .eq('venue_id', venue_id)
      .gte('fired_at', fourHoursAgo)
      .order('fired_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentFlare) {
      return new Response(
        JSON.stringify({ error: 'Cooldown active — you fired a flare in the last 4 hours.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check flare credits
    const weekStart = getMondayStr()
    const { data: credits } = await supabase
      .from('flare_credits')
      .select('balance')
      .eq('venue_id', venue_id)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (credits && credits.balance !== null && credits.balance <= 0) {
      return new Response(
        JSON.stringify({ error: 'No flare credits remaining this week.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fire the flare
    const expiresAt = new Date(Date.now() + (duration_min ?? 60) * 60 * 1000).toISOString()

    const { data: flare, error: flareError } = await supabase
      .from('flares')
      .insert({
        venue_id,
        fired_by,
        offer_text,
        discount_desc,
        duration_min: duration_min ?? 60,
        status: 'active',
        expires_at: expiresAt,
      })
      .select('id, offer_text, expires_at')
      .single()

    if (flareError) {
      return new Response(
        JSON.stringify({ error: flareError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Decrement flare credit balance
    if (credits) {
      const newBalance = (credits.balance ?? 0) - 1
      await supabase
        .from('flare_credits')
        .update({ balance: newBalance, spent: (credits.balance ?? 0) > newBalance ? 1 : 0 })
        .eq('venue_id', venue_id)
        .eq('week_start', weekStart)
    } else {
      // Create a credit row if none exists (start with 3 flares, spend 1)
      await supabase
        .from('flare_credits')
        .insert({
          venue_id,
          week_start: weekStart,
          earned_drops: 0,
          earned_special: 0,
          earned_sub: 0,
          earned_bounty: 0,
          spent: 1,
          balance: 2,
        })
    }

    return new Response(
      JSON.stringify({ success: true, flare }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
