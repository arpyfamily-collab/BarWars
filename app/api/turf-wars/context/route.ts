import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/context
 * Returns the current turf war context for the FAB on the home page.
 *
 * Logic:
 * 1. If there are live attacks (sneak_attack or war_declaration with status 'live')
 *    → "defend" (red, pulsing) — urgent: an attack is underway
 * 2. If there are pending claims with attacker headcount > 0 but not yet live
 *    → "join_attack" (gold, pulsing) — rally phase
 * 3. If turf wars are enabled on any bar but no active combat
 *    → "declare" (green) — peaceful, ready to claim
 * 4. Otherwise → "default" (dark) — enter war room
 */
export async function GET() {
  const service = createServiceClient()

  // Check for live attacks
  const { count: liveAttacks } = await service
    .from('turf_claims')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'live')
    .in('claim_type', ['sneak_attack', 'war_declaration'])

  if ((liveAttacks ?? 0) > 0) {
    return ok({ action: 'defend' })
  }

  // Check for pending claims that are rallying
  const { count: rallyingClaims } = await service
    .from('turf_claims')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gt('attacker_verified_headcount', 0)

  if ((rallyingClaims ?? 0) > 0) {
    return ok({ action: 'join_attack' })
  }

  // Check if any bar has turf enabled
  const { count: turfBars } = await service
    .from('venues')
    .select('*', { count: 'exact', head: true })
    .eq('turf_enabled', true)

  if ((turfBars ?? 0) > 0) {
    return ok({ action: 'declare' })
  }

  return ok({ action: 'default' })
}
