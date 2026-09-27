import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bracelet-hunt
 * The player-facing Hunt list. Deliberately returns NO bar, bar ID, QR code
 * or finder: the bar stays a surprise until the bracelet is scanned, and
 * clues are only included once their release time has passed.
 */
type DropRow = {
  id: string
  offer_type: string
  offer_value: string | null
  hidden_at: string
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_1_released_at: string | null
  clue_2_released_at: string | null
  clue_3_released_at: string | null
}

function released(at: string | null, fallback: string | null, now: number): string | null {
  const t = at ?? fallback
  return t && new Date(t).getTime() <= now ? t : null
}

export async function GET() {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()
  const now = Date.now()
  const since = new Date(now - 48 * 60 * 60 * 1000).toISOString()

  const [activeRes, foundRes] = await Promise.all([
    service
      .from('bracelet_drops')
      .select('id, offer_type, offer_value, hidden_at, clue_1, clue_2, clue_3, clue_1_released_at, clue_2_released_at, clue_3_released_at')
      .eq('status', 'hidden')
      .gte('hidden_at', since)
      .order('hidden_at', { ascending: false }),
    service
      .from('bracelet_drops')
      .select('id, status, offer_value, found_at')
      .in('status', ['kept', 'donated'])
      .not('found_at', 'is', null)
      .order('found_at', { ascending: false })
      .limit(5),
  ])

  if (activeRes.error || foundRes.error) return err('Could not load the hunt', 500)

  const active = ((activeRes.data ?? []) as DropRow[]).map((d) => {
    // Clue 1 goes live when the bracelet is hidden unless a time was set
    const r1 = released(d.clue_1_released_at, d.hidden_at, now)
    const r2 = released(d.clue_2_released_at, null, now)
    const r3 = released(d.clue_3_released_at, null, now)
    return {
      id: d.id,
      offer_type: d.offer_type,
      offer_value: d.offer_value,
      hidden_at: d.hidden_at,
      clue_1: r1 ? d.clue_1 : null,
      clue_2: r2 ? d.clue_2 : null,
      clue_3: r3 ? d.clue_3 : null,
      // Release times stay so the app can count down to the next clue
      clue_1_released_at: d.clue_1_released_at ?? d.hidden_at,
      clue_2_released_at: d.clue_2 ? d.clue_2_released_at : null,
      clue_3_released_at: d.clue_3 ? d.clue_3_released_at : null,
    }
  })

  return ok({ active, found: foundRes.data ?? [] })
}
