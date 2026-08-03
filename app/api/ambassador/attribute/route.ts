/**
 * POST /api/ambassador/attribute
 *
 * Called from the Stripe webhook after a pass purchase completes,
 * when the original checkout session had a referral_code in metadata.
 *
 * Attributes revenue to:
 *   L1 — the direct referrer (commission rate by tier)
 *   L2 — who referred the referrer (half the L1 commission rate)
 *
 * Also upgrades ambassador tier if new referral count crosses a bracket.
 *
 * This is an internal route — called server-to-server only.
 * Verified via x-internal-key header matching INTERNAL_API_KEY env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-internal-key')
  if (key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { referral_code, buyer_user_id, pass_id, bar_id, revenue_cents } = await req.json()
  if (!referral_code || !buyer_user_id || !revenue_cents) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const service = createServiceClient()

  // Resolve the referral code to an ambassador
  const { data: l1Ambassador } = await service
    .from('ambassadors')
    .select('id, user_id, tier, lifetime_referrals, lifetime_revenue')
    .eq('referral_code', referral_code)
    .single()

  if (!l1Ambassador) return NextResponse.json({ error: 'Referral code not found' }, { status: 404 })

  // Don't credit self-referrals
  if ((l1Ambassador as any).user_id === buyer_user_id) {
    return NextResponse.json({ skipped: 'self-referral' })
  }

  // Commission rate for L1
  const l1Bps   = getTierCommissionBps((l1Ambassador as any).tier)
  const l1Cents = Math.floor(revenue_cents * l1Bps / 10000)

  // Insert L1 referral event
  await service.from('referral_events').insert({
    referrer_id:      (l1Ambassador as any).id,
    referred_user_id: buyer_user_id,
    level:            1,
    pass_id:          pass_id ?? null,
    bar_id:           bar_id  ?? null,
    revenue_cents,
    commission_cents: l1Cents,
  })

  // Credit L1 ambassador
  const newL1Referrals = (l1Ambassador as any).lifetime_referrals + 1
  const newL1Revenue   = (l1Ambassador as any).lifetime_revenue + revenue_cents
  const newTier        = getTierForCount(newL1Referrals)
  const tierChanged    = newTier !== (l1Ambassador as any).tier

  await service.from('ambassadors').update({
    lifetime_referrals: newL1Referrals,
    lifetime_revenue:   newL1Revenue,
    credit_balance_cents: service.rpc('increment_col', { row_id: (l1Ambassador as any).id, col: 'credit_balance_cents', amount: l1Cents }),
    tier: newTier,
  }).eq('id', (l1Ambassador as any).id)

  // If tier upgraded, issue bar credit reward
  if (tierChanged) {
    await issueTierUpgradeReward(service, (l1Ambassador as any).id, newTier, bar_id)
  }

  // ── L2 attribution (who referred the L1 ambassador) ──────────────────────
  // Find if L1 ambassador was referred by someone
  const { data: l1ReferralEvent } = await service
    .from('referral_events')
    .select('referrer_id')
    .eq('referred_user_id', (l1Ambassador as any).user_id)
    .eq('level', 1)
    .limit(1)
    .single()

  let l2Result = null

  if (l1ReferralEvent) {
    const l2Bps   = Math.floor(l1Bps / 2)  // L2 gets half L1 rate
    const l2Cents = Math.floor(revenue_cents * l2Bps / 10000)

    if (l2Cents > 0) {
      await service.from('referral_events').insert({
        referrer_id:      (l1ReferralEvent as any).referrer_id,
        referred_user_id: buyer_user_id,
        level:            2,
        pass_id:          pass_id ?? null,
        bar_id:           bar_id  ?? null,
        revenue_cents,
        commission_cents: l2Cents,
      })

      await service.from('ambassadors').update({
        lifetime_l2_referrals: service.rpc('increment_col', {
          row_id: (l1ReferralEvent as any).referrer_id,
          col: 'lifetime_l2_referrals',
          amount: 1,
        }),
        credit_balance_cents: service.rpc('increment_col', {
          row_id: (l1ReferralEvent as any).referrer_id,
          col: 'credit_balance_cents',
          amount: l2Cents,
        }),
      }).eq('id', (l1ReferralEvent as any).referrer_id)

      l2Result = { commission_cents: l2Cents }
    }
  }

  return NextResponse.json({
    l1: { commission_cents: l1Cents, tier_changed: tierChanged, new_tier: newTier },
    l2: l2Result,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTierCommissionBps(tier: string): number {
  const rates: Record<string, number> = {
    scout: 500, soldier: 800, captain: 1200, general: 1500,
  }
  return rates[tier] ?? 500
}

function getTierForCount(count: number): string {
  if (count >= 30) return 'general'
  if (count >= 15) return 'captain'
  if (count >= 5)  return 'soldier'
  return 'scout'
}

async function issueTierUpgradeReward(
  service:       ReturnType<typeof createServiceClient>,
  ambassadorId:  string,
  tier:          string,
  barId?:        string
) {
  const rewards: Record<string, { type: string; amount: number; description: string }> = {
    soldier: { type: 'pass_credit',  amount: 2000,  description: 'Tier upgrade reward — Soldier: $20 in pass credit' },
    captain: { type: 'pass_credit',  amount: 5000,  description: 'Tier upgrade reward — Captain: $50 in pass credit + 2 free passes/month' },
    general: { type: 'drink_credit', amount: 10000, description: 'Tier upgrade reward — General: $100 drink credit + priority entry lane' },
  }

  const reward = rewards[tier]
  if (!reward) return

  await service.from('ambassador_compensation').insert({
    ambassador_id: ambassadorId,
    bar_id:        barId ?? null,
    type:          reward.type,
    amount_cents:  reward.amount,
    description:   reward.description,
  })
}
