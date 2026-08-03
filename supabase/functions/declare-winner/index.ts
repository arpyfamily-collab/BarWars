/**
 * declare-winner
 *
 * Cron job — runs every 5 minutes via pg_cron or Supabase scheduled functions.
 * Finds challenges whose window_end has passed but status is still 'live',
 * calls finalise_challenge() RPC for each, then fires winner/consolation
 * notifications and schedules the forfeit reminder.
 *
 * Also handles the 30-minute warning notification.
 *
 * Schedule (add to supabase/config.toml):
 *   [functions.declare-winner]
 *   schedule = "*/5 * * * *"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // Allow both cron invocation (GET) and manual trigger (POST)
  if (!['GET', 'POST'].includes(req.method)) {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const results: Record<string, unknown>[] = []

  // ── 1. Close challenges whose window has ended ───────────────────────────
  const { data: expiredChallenges } = await supabase
    .from('bar_challenges')
    .select('id, challenger_bar_id, opponent_bar_id, window_end')
    .eq('status', 'live')
    .lte('window_end', new Date().toISOString())

  for (const challenge of expiredChallenges ?? []) {
    console.log(`[declare-winner] Finalising challenge ${challenge.id}`)

    const { data: finalResult, error } = await supabase
      .rpc('finalise_challenge', { p_challenge_id: challenge.id })

    if (error || (finalResult as any)?.error) {
      console.error(`[declare-winner] Failed to finalise ${challenge.id}:`, error ?? (finalResult as any)?.error)
      results.push({ challenge_id: challenge.id, status: 'error' })
      continue
    }

    const result = finalResult as {
      winner_bar_id:    string
      loser_bar_id:     string
      challenger_score: number
      opponent_score:   number
      forfeit_deadline: string
    }

    // Queue winner notification
    await queueNotification(supabase, challenge.id, {
      trigger_type: 'winner_declared',
      audience:     'all_participants',
      headline:     await buildWinnerHeadline(supabase, result.winner_bar_id, result.challenger_score, result.opponent_score),
      body:         'Check your passes for credits and your profile for badges.',
      deep_link:    `/challenge/${challenge.id}/result`,
    })

    // Queue consolation notification for losing participants who were checked in
    await queueNotification(supabase, challenge.id, {
      trigger_type: 'consolation_credit',
      audience:     'losing_participants',
      headline:     'Good fight. $5 credit is on us.',
      body:         'Your consolation credit has been added to your account.',
      deep_link:    `/my-passes`,
    })

    // Queue forfeit reminder for losing bar admin — fires at forfeit_deadline
    await queueNotification(supabase, challenge.id, {
      trigger_type: 'forfeit_reminder',
      audience:     'both_admins',
      headline:     'Forfeit due in 24 hours',
      body:         'The losing bar must confirm forfeit payment in the dashboard.',
      deep_link:    `/dashboard/challenges`,
      scheduled_at: result.forfeit_deadline,
    })

    // Dispatch winner notification now
    await invokeNotifications(challenge.id, 'winner_declared', 'all_participants')
    await invokeNotifications(challenge.id, 'consolation_credit', 'losing_participants')

    results.push({ challenge_id: challenge.id, status: 'finalised', ...result })
  }

  // ── 2. Send 30-minute warnings for challenges approaching end ────────────
  const thirtyMinFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const twentyFiveMinFromNow = new Date(Date.now() + 25 * 60 * 1000).toISOString()

  const { data: warningChallenges } = await supabase
    .from('bar_challenges')
    .select('id, challenger_bar_id, opponent_bar_id')
    .eq('status', 'live')
    .gte('window_end', twentyFiveMinFromNow)
    .lte('window_end', thirtyMinFromNow)

  for (const challenge of warningChallenges ?? []) {
    // Check if we already sent the 30-min warning
    const { data: existing } = await supabase
      .from('challenge_notifications')
      .select('id')
      .eq('challenge_id', challenge.id)
      .eq('trigger_type', 'thirty_min_warning')
      .limit(1)
      .single()

    if (!existing) {
      await queueNotification(supabase, challenge.id, {
        trigger_type: 'thirty_min_warning',
        audience:     'all_geofenced_users',
        headline:     '30 minutes left in the war!',
        body:         'Final push — every check-in counts.',
        deep_link:    `/challenge/${challenge.id}/battle`,
      })
      await invokeNotifications(challenge.id, 'thirty_min_warning', 'all_geofenced_users')
    }
  }

  // ── 3. Flip approved challenges to live at window_start ──────────────────
  const { data: startingChallenges } = await supabase
    .from('bar_challenges')
    .select('id')
    .eq('status', 'approved')
    .lte('window_start', new Date().toISOString())

  for (const challenge of startingChallenges ?? []) {
    await supabase
      .from('bar_challenges')
      .update({ status: 'live' })
      .eq('id', challenge.id)

    // War declared notification fires here
    await invokeNotifications(challenge.id, 'war_declared', 'all_geofenced_users')
    results.push({ challenge_id: challenge.id, status: 'went_live' })
  }

  // ── 4. Flag overdue forfeits ──────────────────────────────────────────────
  const { data: overdueChallenges } = await supabase
    .from('bar_challenges')
    .select('id')
    .eq('status', 'completed')
    .eq('forfeit_paid', false)
    .lte('forfeit_deadline', new Date().toISOString())

  for (const challenge of overdueChallenges ?? []) {
    await supabase
      .from('bar_challenges')
      .update({ status: 'forfeit_unpaid' })
      .eq('id', challenge.id)

    // Increment losing bar's forfeit count
    const { data: ch } = await supabase
      .from('bar_challenges')
      .select('challenger_bar_id, opponent_bar_id, winner_bar_id')
      .eq('id', challenge.id)
      .single()

    if (ch) {
      const { challenger_bar_id, opponent_bar_id, winner_bar_id } = ch as any
      const loserId = winner_bar_id === challenger_bar_id ? opponent_bar_id : challenger_bar_id
      await supabase
        .from('venues')
        .update({ forfeit_unpaid_count: supabase.rpc('increment', { row_id: loserId }) })
        .eq('id', loserId)
    }
  }

  return json({ ok: true, processed: results.length, results })
})

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildWinnerHeadline(
  supabase:       ReturnType<typeof createClient>,
  winnerBarId:    string,
  challengerScore: number,
  opponentScore:  number
): Promise<string> {
  const { data: bar } = await supabase
    .from('venues')
    .select('name')
    .eq('id', winnerBarId)
    .single()
  const name = (bar as any)?.name ?? 'The winner'
  return `${name} wins! ${Math.max(challengerScore, opponentScore)}–${Math.min(challengerScore, opponentScore)}`
}

async function queueNotification(
  supabase:     ReturnType<typeof createClient>,
  challenge_id: string,
  notif: {
    trigger_type:  string
    audience:      string
    headline:      string
    body?:         string
    deep_link?:    string
    scheduled_at?: string
  }
): Promise<void> {
  await supabase.from('challenge_notifications').insert({
    challenge_id,
    trigger_type: notif.trigger_type,
    audience:     notif.audience,
    headline:     notif.headline,
    body:         notif.body ?? null,
    deep_link:    notif.deep_link ?? null,
    scheduled_at: notif.scheduled_at ?? new Date().toISOString(),
  })
}

async function invokeNotifications(
  challenge_id: string,
  trigger:      string,
  audience:     string
): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/challenge-notifications`
  try {
    await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ challenge_id, trigger, audience }),
    })
  } catch (err) {
    console.error(`[declare-winner] Failed to invoke notifications for ${challenge_id}:`, err)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
