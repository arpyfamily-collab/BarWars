/**
 * bracelet-test-reset
 *
 * Cron: every 6 hours — resets the App Review test bracelet back to 'hidden'
 * so reviewers can always scan and test the bracelet hunt flow.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const TEST_TOKEN = 'a0000000-0000-4000-8000-000000000001'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('bracelet_drops')
      .update({
        status: 'hidden',
        found_by: null,
        found_at: null,
        hidden_at: now,
        clue_1_released_at: now,
        clue_2_released_at: now,
        clue_3_released_at: now,
      })
      .eq('qr_token', TEST_TOKEN)

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ reset: true, at: now }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
