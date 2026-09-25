/**
 * delete-account
 *
 * Called by an authenticated user to permanently delete their account.
 * Deletes the user's profile, predictions, and personal data. Messages and
 * battle records stay visible to other players but are no longer linked.
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'No session found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'No session found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = user.id

    // Delete personal data — messages and battle records stay visible but unlinked
    const tables = [
      'predictions',
      'prediction_leaderboard',
      'user_skins',
      'user_skin_loadout',
      'user_push_tokens',
      'veteran_badges',
      'turf_checkins',
      'spy_badges',
      'regiment_members',
      'regiment_finder_profiles',
      'org_memberships',
      'phone_verifications',
      'edu_verifications',
      'ghost_profiles',
      'flagged_checkins',
      'device_fingerprints',
      'deception_log',
      'channel_read_status',
      'channel_members',
      'challenge_participants',
      'challenge_score_events',
      'bar_admins',
      'allies',
      'hessian_members',
      'mercenaries',
      'war_bond_ledger',
      'war_special_votes',
      'passes',
    ]

    for (const table of tables) {
      await supabase.from(table).delete().eq('user_id', userId)
    }

    // Wallets keyed by owner_id
    await supabase.from('war_bond_wallets').delete().eq('owner_id', userId)

    // Bracelet drops found/hidden by user — unclaim rather than delete
    await supabase.from('bracelet_drops')
      .update({ found_by: null, found_at: null, status: 'hidden' })
      .eq('found_by', userId)

    // Channels created by user — leave them but null out creator
    await supabase.from('channels')
      .update({ created_by: null })
      .eq('created_by', userId)

    // Delete profile
    await supabase.from('profiles').delete().eq('id', userId)

    // Finally, delete the auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
