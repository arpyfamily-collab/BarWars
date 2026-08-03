/**
 * POST /api/challenges/nominations
 *
 * Any authenticated user can nominate a Bar vs Bar grudge match.
 * Charges $2 via Stripe, adds to the public jackpot for that pairing.
 * When nomination count crosses a threshold, both bar admins are notified.
 *
 * GET /api/challenges/nominations — returns nomination leaderboard (public)
 *
 * Body: { challenger_bar_id, opponent_bar_id }
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { stripe, formatCents } from '@/lib/stripe'
import { requireAuth, ok, err } from '@/lib/challenges'

const NOMINATION_FEE_CENTS = 200  // $2.00
const NOTIFY_THRESHOLD      = 10  // notify bar admins after this many nominations

// ─── GET — nomination leaderboard ────────────────────────────────────────────

export async function GET() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('nomination_leaderboard')
    .select(`
      nomination_count, total_jackpot_cents, last_nominated_at, challenge_exists,
      challenger:venues!challenger_bar_id(id, name, slug),
      opponent:venues!opponent_bar_id(id, name, slug)
    `)
    .limit(20)

  if (error) return err(error.message, 500)
  return ok(data)
}

// ─── POST — nominate a matchup ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  // 2. Parse body
  let body: { challenger_bar_id: string; opponent_bar_id: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.challenger_bar_id || !body.opponent_bar_id) {
    return err('challenger_bar_id and opponent_bar_id are required')
  }

  if (body.challenger_bar_id === body.opponent_bar_id) {
    return err('A bar cannot be nominated to fight itself')
  }

  const service = createServiceClient()

  // 3. Verify both bars exist
  const { data: bars } = await service
    .from('venues')
    .select('id, name')
    .in('id', [body.challenger_bar_id, body.opponent_bar_id])

  if ((bars ?? []).length < 2) return err('One or both bars not found', 404)

  // 4. Get caller's email for Stripe
  const { data: { user } } = await (await import('@/lib/supabase')).createServerSupabaseClient().auth.getUser()

  // 5. Create Stripe checkout for the $2 nomination fee
  const challengerName = (bars as any[]).find(b => b.id === body.challenger_bar_id)?.name ?? 'Bar A'
  const opponentName   = (bars as any[]).find(b => b.id === body.opponent_bar_id)?.name   ?? 'Bar B'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency:     'usd',
        unit_amount:  NOMINATION_FEE_CENTS,
        product_data: {
          name:        `BarWars grudge match nomination`,
          description: `${challengerName} vs ${opponentName} — goes into the jackpot`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type:               'nomination',
      user_id:            userId!,
      challenger_bar_id:  body.challenger_bar_id,
      opponent_bar_id:    body.opponent_bar_id,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/challenges/nominations?nominated=1`,
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/challenges/nominations`,
    customer_email: user?.email,
  })

  // Note: the nomination row is created in the Stripe webhook (webhook/route.ts)
  // after payment confirmation, not here — prevents free nominations on cancel.

  return ok({ checkout_url: session.url }, 201)
}
