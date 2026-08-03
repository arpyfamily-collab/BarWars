/**
 * GET  /api/drops          — today's drop + caller's queue status
 * POST /api/drops/[id]/enter-queue  — join the waiting room
 * POST /api/drops/[id]/claim        — claim eligible pass
 * POST /api/drops/[id]/guess        — submit a distribution guess
 */

// ─── GET /api/drops ────────────────────────────────────────────────────────────
// app/api/drops/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const service = createServiceClient()

  // Get the next upcoming or active drop
  const { data: drop } = await service
    .from('mystery_drops')
    .select(`
      id, status, queue_opens_at, drop_at, expires_at,
      total_passes, passes_claimed, discount_percent,
      original_price_cents, teaser_text, is_surprise,
      pass_distribution, guess_reward_cents,
      venues(name)
    `)
    .not('status', 'in', '(completed,cancelled)')
    .order('drop_at', { ascending: true })
    .limit(1)
    .single()

  if (!drop) return NextResponse.json({ drop: null })

  let myEntry = null
  let myGuess = null

  if (user) {
    const { data: entry } = await service
      .from('drop_queue_entries')
      .select('queue_position, eligible, pass_type, claimed, pass_id')
      .eq('drop_id', (drop as any).id)
      .eq('user_id', user.id)
      .single()

    myEntry = entry ?? null

    const { data: guess } = await service
      .from('drop_guesses')
      .select('guessed_distribution, was_correct, credit_awarded_cents')
      .eq('drop_id', (drop as any).id)
      .eq('user_id', user.id)
      .single()

    myGuess = guess ?? null
  }

  // Hide pass distribution until drop goes live (preserve surprise)
  const publicDrop = {
    ...drop,
    pass_distribution: (drop as any).status === 'live' || (drop as any).status === 'sold_out'
      ? (drop as any).pass_distribution
      : null,
  }

  return NextResponse.json({ drop: publicDrop, my_entry: myEntry, my_guess: myGuess })
}
