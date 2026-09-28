import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Player side of Battle Plans (item 19).
 * GET ?claim_id=           → offers that fired for this war tonight, with this player's code if claimed
 * POST { firing_id }       → claim a code (must be checked in to the war; first come, first served)
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const claimId = new URL(req.url).searchParams.get('claim_id')
  if (!claimId || !/^[0-9a-f-]{36}$/i.test(claimId)) return err('claim_id is required')
  const s = createServiceClient()
  const { data: night } = await s.rpc('bar_night')
  const { data: firings } = await s.from('battle_plan_firings')
    .select('id, claimed_count, venue:venues(name), plan:battle_plans(offer_text, details, is_drink, cap)')
    .eq('claim_id', claimId).eq('night', night as string)
  const ids = ((firings as any[]) ?? []).map(f => f.id)
  const { data: mine } = ids.length
    ? await s.from('battle_plan_claims').select('firing_id, code, redeemed_at').eq('user_id', userId!).in('firing_id', ids)
    : { data: [] as any[] }
  const { data: checkedIn } = await s.from('turf_checkins').select('id').eq('claim_id', claimId).eq('user_id', userId!).limit(1)
  return ok({
    checked_in: !!checkedIn?.length,
    offers: ((firings as any[]) ?? []).map(f => {
      const m = (mine as any[])?.find(x => x.firing_id === f.id)
      return { id: f.id, bar: f.venue?.name, offer: f.plan?.offer_text, details: f.plan?.details, is_drink: f.plan?.is_drink,
               left: Math.max(0, (f.plan?.cap ?? 0) - f.claimed_count), code: m?.code ?? null, redeemed: !!m?.redeemed_at }
    }),
  })
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error } = await createServiceClient().rpc('claim_battle_plan', { p_user: userId, p_firing: body.firing_id })
  if (error) {
    if (error.message.includes('NOT_IN_WAR')) return err('Check in to the war to claim this.', 403)
    if (error.message.includes('CAP_REACHED')) return err('All claimed. Should have checked in sooner.', 409)
    if (error.message.includes('OFFER_OVER')) return err('This offer is over.', 409)
    return err('Could not claim.', 500)
  }
  return ok(data)
}
