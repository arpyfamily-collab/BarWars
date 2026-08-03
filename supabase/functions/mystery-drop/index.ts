/**
 * mystery-drop
 *
 * Cron — runs every minute via Supabase scheduled functions.
 * Handles three transitions:
 *   1. scheduled → queue_open   (at queue_opens_at)
 *   2. queue_open → live        (at drop_at — calls randomize_drop_queue RPC)
 *   3. live → completed         (at expires_at — voids unclaimed passes)
 *
 * Add to supabase/config.toml:
 *   [functions.mystery-drop]
 *   schedule = "* * * * *"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const now = new Date().toISOString()
  const log: string[] = []

  // ── 1. Open queues ─────────────────────────────────────────────────────────
  const { data: toOpen } = await supabase
    .from('mystery_drops')
    .select('id, venue_id, teaser_text, is_surprise')
    .eq('status', 'scheduled')
    .lte('queue_opens_at', now)

  for (const drop of toOpen ?? []) {
    await supabase
      .from('mystery_drops')
      .update({ status: 'queue_open' })
      .eq('id', drop.id)

    // Notify all users — Library Card holders get early access (5 min before public)
    await notifyDropQueuing(supabase, drop.id, drop.venue_id, drop.teaser_text, drop.is_surprise)
    log.push(`Opened queue: ${drop.id}`)
  }

  // ── 2. Randomize queue and go live ─────────────────────────────────────────
  const { data: toRandomize } = await supabase
    .from('mystery_drops')
    .select('id, venue_id, total_passes')
    .eq('status', 'queue_open')
    .lte('drop_at', now)

  for (const drop of toRandomize ?? []) {
    const { data, error } = await supabase.rpc('randomize_drop_queue', { p_drop_id: drop.id })

    if (error) {
      console.error(`[mystery-drop] randomize failed for ${drop.id}:`, error)
      continue
    }

    const result = data as { eligible_count: number; total_in_queue: number }
    log.push(`Randomized ${drop.id}: ${result.eligible_count} eligible of ${result.total_in_queue} in queue`)

    // Notify eligible users
    await notifyEligible(supabase, drop.id, result.eligible_count)
  }

  // ── 3. Expire completed drops ───────────────────────────────────────────────
  const { data: toExpire } = await supabase
    .from('mystery_drops')
    .select('id')
    .in('status', ['live', 'queue_open'])
    .lte('expires_at', now)

  for (const drop of toExpire ?? []) {
    await supabase
      .from('mystery_drops')
      .update({ status: 'completed' })
      .eq('id', drop.id)

    // Resolve guesses
    await resolveGuesses(supabase, drop.id)
    log.push(`Expired drop: ${drop.id}`)
  }

  return new Response(JSON.stringify({ ok: true, log }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Notification helpers ───────────────────────────────────────────────────────

async function notifyDropQueuing(
  supabase: any,
  dropId: string,
  venueId: string,
  teaserText: string | null,
  isSurprise: boolean
) {
  const { data: venue } = await supabase.from('venues').select('name').eq('id', venueId).single()
  const venueName = venue?.name ?? 'The bar'

  const headline = isSurprise
    ? `Something drops at ${venueName} tonight 👀`
    : (teaserText ?? `Mystery drop queue is open at ${venueName}`)

  await supabase.from('challenge_notifications').insert({
    challenge_id:  null,         // drops don't belong to a challenge
    trigger_type:  'war_declared', // reuse push infra
    audience:      'all_geofenced_users',
    headline,
    body:          'Join the queue now — 10 passes drop in minutes. Library Card holders get priority.',
    deep_link:     `/drops`,
    scheduled_at:  new Date().toISOString(),
  }).then(() => {})  // fire-and-forget

  // TODO: invoke challenge-notifications function for actual FCM delivery
  // The notifications function needs a drop_id variant — wire in next iteration
}

async function notifyEligible(supabase: any, dropId: string, eligibleCount: number) {
  // Get eligible user IDs
  const { data: entries } = await supabase
    .from('drop_queue_entries')
    .select('user_id, pass_type, queue_position')
    .eq('drop_id', dropId)
    .eq('eligible', true)
    .order('queue_position')

  // In production: push individualized notifications via FCM
  // "You're #3 in the queue — you got a Music Hall pass. Claim it now."
  // For MVP: log and rely on the patron-side polling/real-time UI
  console.log(`[mystery-drop] ${eligibleCount} eligible users for drop ${dropId}:`,
    entries?.map((e: any) => `#${e.queue_position} ${e.pass_type}`).join(', '))
}

async function resolveGuesses(supabase: any, dropId: string) {
  const { data: drop } = await supabase
    .from('mystery_drops')
    .select('pass_distribution, guess_reward_cents')
    .eq('id', dropId)
    .single()

  if (!drop) return

  const { data: guesses } = await supabase
    .from('drop_guesses')
    .select('id, user_id, guessed_distribution')
    .eq('drop_id', dropId)
    .is('was_correct', null)

  for (const guess of guesses ?? []) {
    const actual  = drop.pass_distribution as Record<string, number>
    const guessed = guess.guessed_distribution as Record<string, number>
    const correct = Object.keys(actual).every(k => actual[k] === (guessed[k] ?? 0))

    await supabase.from('drop_guesses').update({
      was_correct:          correct,
      credit_awarded_cents: correct ? drop.guess_reward_cents : 0,
    }).eq('id', guess.id)

    // TODO: credit the user's account when pass credit system is built
  }
}
