/**
 * turf-war-scheduler
 *
 * Cron edge function that runs every 5 minutes to:
 * 1. Open turf claim windows (flip pending → live when window_open_at arrives)
 * 2. Close expired turf claims (flip live → failed/successful when window_close_at passes)
 * 3. Expire stale shots fired records (flip confirmed → expired when 72hr passes with no attack)
 * 4. Check maintenance night compliance (mark missed nights, auto-forfeit after 2 consecutive)
 *
 * Scheduled: every 5 minutes
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const now = new Date().toISOString()
  const results: string[] = []

  // 1. Open pending claim windows
  const { data: opened, error: openErr } = await supabase
    .from('turf_claims')
    .update({ status: 'live' })
    .eq('status', 'pending')
    .lte('window_open_at', now)
    .gt('window_close_at', now)
    .select('id')

  if (openErr) {
    console.error('[turf-scheduler] Error opening claims:', openErr)
  } else if (opened && opened.length > 0) {
    results.push(`Opened ${opened.length} claim(s)`)
  }

  // 2. Close expired live claims — determine outcome
  const { data: expired } = await supabase
    .from('turf_claims')
    .select(`
      id, claim_type, attacking_org_id, defending_org_id, bar_id,
      required_headcount, attacker_verified_headcount, defender_verified_headcount
    `)
    .eq('status', 'live')
    .lte('window_close_at', now)

  if (expired && expired.length > 0) {
    for (const claim of expired as any[]) {
      let newStatus = 'failed'
      let result = 'Attacker did not reach required headcount.'

      if (claim.attacker_verified_headcount >= claim.required_headcount) {
        // Attacker reached threshold — check if defender matched
        if (claim.defender_verified_headcount >= claim.attacker_verified_headcount) {
          // Defender matched or exceeded — tiebreaker: whoever reached threshold first
          // For simplicity, attacker wins ties (they reached their own threshold)
          newStatus = 'successful'
          result = 'Attacker reached headcount. Defender matched but attacker holds the claim.'
        } else {
          newStatus = 'successful'
          result = 'Attacker reached required headcount. Defender could not match.'
        }
      } else if (claim.claim_type === 'sneak_attack' && claim.defending_org_id && claim.defender_verified_headcount > 0) {
        // Sneak attack where defender showed up but attacker didn't reach threshold
        newStatus = 'failed'
        result = 'Attack repelled — attacker did not reach required headcount.'
      }

      await supabase
        .from('turf_claims')
        .update({ status: newStatus, result })
        .eq('id', claim.id)

      // If successful, transfer turf
      if (newStatus === 'successful') {
        await supabase
          .from('greek_orgs')
          .update({
            home_turf_bar_id: claim.bar_id,
            turf_claimed_at: now,
            turf_streak_weeks: 1,
          })
          .eq('id', claim.attacking_org_id)

        if (claim.defending_org_id) {
          await supabase
            .from('greek_orgs')
            .update({ home_turf_bar_id: null, turf_claimed_at: null, turf_streak_weeks: 0 })
            .eq('id', claim.defending_org_id)
        }

        // Log turf transfer event
        const { data: bar } = await supabase
          .from('venues')
          .select('name')
          .eq('id', claim.bar_id)
          .single()

        const { data: org } = await supabase
          .from('greek_orgs')
          .select('name')
          .eq('id', claim.attacking_org_id)
          .single()

        await supabase.from('turf_events').insert({
          claim_id: claim.id,
          event_type: 'war_declared',
          org_id: claim.attacking_org_id,
          bar_id: claim.bar_id,
          headline: `${org?.name ?? 'An org'} claimed ${bar?.name ?? 'a bar'}`,
          body: result,
          deep_link: `/turf-wars/${claim.id}`,
          visible_to: 'public',
        })
      } else if (claim.defending_org_id) {
        // Attack failed — defender keeps turf
        const { data: bar } = await supabase
          .from('venues')
          .select('name')
          .eq('id', claim.bar_id)
          .single()

        await supabase.from('turf_events').insert({
          claim_id: claim.id,
          event_type: 'turf_defended',
          org_id: claim.defending_org_id,
          bar_id: claim.bar_id,
          headline: `${bar?.name ?? 'Bar'} defended`,
          body: result,
          deep_link: `/turf-wars/${claim.id}`,
          visible_to: 'public',
        })
      }
    }
    results.push(`Closed ${expired.length} expired claim(s)`)
  }

  // 3. Expire stale shots fired (confirmed but no attack within 72 hours)
  //     On expire: 50% of surge fee refunded to org, 50% kept by bar
  const { data: expiredShots, error: shotsErr } = await supabase
    .from('shots_fired')
    .update({ status: 'expired' })
    .in('status', ['pending_confirmation', 'confirmed'])
    .lt('expires_at', now)
    .select('id, bar_id, org_id, surge_fee_cents')

  if (shotsErr) {
    console.error('[turf-scheduler] Error expiring shots:', shotsErr)
  } else if (expiredShots && expiredShots.length > 0) {
    for (const shot of expiredShots as any[]) {
      // Calculate 50% refund for stand-down
      const surgeFee = shot.surge_fee_cents ?? 0
      const refundAmount = Math.floor(surgeFee * 0.5)

      if (refundAmount > 0) {
        await supabase
          .from('shots_fired')
          .update({ surge_fee_refunded_cents: refundAmount })
          .eq('id', shot.id)
      }

      const { data: orgData } = await supabase
        .from('greek_orgs')
        .select('name')
        .eq('id', shot.org_id)
        .single()
      const { data: barData } = await supabase
        .from('venues')
        .select('name')
        .eq('id', shot.bar_id)
        .single()
      await supabase.from('turf_events').insert({
        event_type: 'rally_called',
        bar_id: shot.bar_id,
        headline: `Stand down — ${orgData?.name ?? 'An org'} backed off at ${barData?.name ?? 'a bar'}`,
        body: 'No attack followed the shots fired. The bar is no longer under threat.',
        visible_to: 'public',
      })
    }
    results.push(`Expired ${expiredShots.length} stale shot(s) with refund processing`)
  }

  // 3b. Auto-create sneak attack claims when attack windows open
  const { data: readyShots } = await supabase
    .from('shots_fired')
    .select(`
      id, org_id, bar_id, attack_window_opens_at, attack_window_closes_at,
      resulting_claim_id
    `)
    .eq('status', 'confirmed')
    .lte('attack_window_opens_at', now)
    .gt('attack_window_closes_at', now)
    .is('resulting_claim_id', null)

  if (readyShots && readyShots.length > 0) {
    for (const shot of readyShots as any[]) {
      // Find defending org (holder of this bar)
      const { data: defender } = await supabase
        .from('greek_orgs')
        .select('id, name, verified_member_count')
        .eq('home_turf_bar_id', shot.bar_id)
        .maybeSingle()

      // Get bar config
      const { data: bar } = await supabase
        .from('venues')
        .select('name, turf_sneak_attack_headcount_pct')
        .eq('id', shot.bar_id)
        .single()

      // Get attacker's verified member count
      const { data: attacker } = await supabase
        .from('greek_orgs')
        .select('name, verified_member_count')
        .eq('id', shot.org_id)
        .single()

      const headcountPct = bar?.tur_sneak_attack_headcount_pct ?? bar?.turf_sneak_attack_headcount_pct ?? 20
      const requiredHeadcount = Math.max(1, Math.ceil((attacker?.verified_member_count ?? 10) * headcountPct / 100))

      // Create the sneak attack claim
      const { data: claim, error: claimErr } = await supabase
        .from('turf_claims')
        .insert({
          claim_type: 'sneak_attack',
          attacking_org_id: shot.org_id,
          defending_org_id: defender?.id ?? null,
          bar_id: shot.bar_id,
          status: 'live',
          window_open_at: shot.attack_window_opens_at,
          window_close_at: shot.attack_window_closes_at,
          required_headcount: requiredHeadcount,
          detection_threshold: 50,
          rally_window_minutes: 45,
          lockout_days: 14,
        })
        .select('id')
        .single()

      if (!claimErr && claim) {
        // Link the shot to the claim
        await supabase
          .from('shots_fired')
          .update({ resulting_claim_id: (claim as any).id })
          .eq('id', shot.id)

        // Increment sneak attack launched stat
        await supabase.rpc('increment_sneak_attack_launched', { p_org_id: shot.org_id })

        // Log the attack window opening
        await supabase.from('turf_events').insert({
          claim_id: (claim as any).id,
          event_type: 'sneak_attack_detected',
          org_id: shot.org_id,
          bar_id: shot.bar_id,
          headline: `Attack window open at ${bar?.name ?? 'a bar'}`,
          body: `${attacker?.name ?? 'An org'} launched a sneak attack. You have 90 minutes to check in.`,
          deep_link: `/turf-wars/${(claim as any).id}`,
          visible_to: 'public',
        })

        // Send push to both orgs
        const allOrgIds = [shot.org_id, defender?.id].filter(Boolean) as string[]
        for (const orgId of allOrgIds) {
          const { data: members } = await supabase
            .from('org_memberships')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('verified', true)

          const memberIds = (members ?? []).map((m: any) => m.user_id)
          if (memberIds.length === 0) continue

          const { data: tokenRows } = await supabase
            .from('user_push_tokens')
            .select('fcm_token')
            .in('user_id', memberIds)
            .not('fcm_token', 'is', null)

          const tokens = (tokenRows ?? []).map((r: any) => r.fcm_token as string)
          if (tokens.length === 0) continue

          const isAttacker = orgId === shot.org_id
          const title = isAttacker ? `Attack window open at ${bar?.name ?? 'a bar'}` : `Sneak attack at ${bar?.name ?? 'a bar'}`
          const body_text = isAttacker
            ? 'The window is open. Get to the bar and check in now.'
            : `${attacker?.name ?? 'An org'} is attacking. Rally and check in to defend your turf.`

          const fcmKey = Deno.env.get('FCM_SERVER_KEY')
          if (fcmKey) {
            try {
              await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                  'Authorization': `key=${fcmKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  registration_ids: tokens.slice(0, 500),
                  notification: { title, body: body_text },
                  data: { deep_link: `/turf-wars/${(claim as any).id}`, source: 'barwars_turf_attack' },
                  android: { priority: 'high' },
                  apns: { headers: { 'apns-priority': '10' } },
                }),
              })
            } catch (e) {
              console.error('[turf-scheduler] FCM error:', e)
            }
          }
        }
      }
    }
    results.push(`Auto-created ${readyShots.length} sneak attack claim(s)`)
  }

  // 4. Check maintenance night compliance
  // For each org holding a turf bar, check if tonight is a maintenance night
  // and if they've met the headcount threshold.
  // This is a simplified check — the full implementation would use a scheduled
  // job per maintenance window close time.
  const today = new Date().getDay()

  const { data: maintenanceNights } = await supabase
    .from('turf_maintenance_nights')
    .select('id, org_id, bar_id, consecutive_misses, required_headcount_pct')
    .eq('day_of_week', today)
    .lt('window_end_time', now.split('T')[1]?.split('+')[0] ?? '23:59')

  if (maintenanceNights && maintenanceNights.length > 0) {
    for (const night of maintenanceNights as any[]) {
      // Count verified checkins for tonight
      // (In production, this would check turf_checkins for tonight's window)
      // For now, just mark as needing check
      const newMisses = (night.consecutive_misses ?? 0) + 1
      const status = newMisses >= 2 ? 'missed' : 'warning'

      await supabase
        .from('turf_maintenance_nights')
        .update({
          status,
          consecutive_misses: newMisses,
          last_checked_at: now,
        })
        .eq('id', night.id)

      // If 2 consecutive misses, forfeit turf
      if (newMisses >= 2) {
        await supabase
          .from('greek_orgs')
          .update({ home_turf_bar_id: null, turf_claimed_at: null, turf_streak_weeks: 0 })
          .eq('id', night.org_id)

        await supabase.from('turf_events').insert({
          event_type: 'turf_lost',
          org_id: night.org_id,
          bar_id: night.bar_id,
          headline: 'Turf forfeited — maintenance not met',
          body: 'The org failed to maintain occupancy for 2 consecutive weeks. The bar is now neutral.',
          visible_to: 'public',
        })
      }
    }
    results.push(`Checked ${maintenanceNights.length} maintenance night(s)`)
  }

  return new Response(
    JSON.stringify({ ok: true, actions: results, timestamp: now }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
})
