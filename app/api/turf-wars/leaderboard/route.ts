import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/leaderboard
 * Public endpoint — returns orgs ranked by composite war score.
 * War score = turf_wins * 3 + wars_won * 5 + sneak_attacks_repelled * 2 + turf_streak_weeks * 2
 * bars_held = count of turf_claims with status 'successful' for that org
 */
export async function GET() {
  const service = createServiceClient()

  const { data: orgs, error } = await service
    .from('greek_orgs')
    .select(`
      id, name, org_type,
      turf_wins, turf_losses, turf_streak_weeks,
      wars_won, wars_lost,
      sneak_attacks_repelled,
      home_turf_bar_id
    `)
    .order('turf_wins', { ascending: false })
    .limit(20)

  if (error || !orgs) return ok([])

  // Count bars held per org from turf_claims
  const { data: claims } = await service
    .from('turf_claims')
    .select('attacking_org_id')
    .eq('status', 'successful')

  const barsHeldMap = new Map<string, number>()
  for (const c of (claims ?? []) as any[]) {
    const orgId = c.attacking_org_id
    if (orgId) barsHeldMap.set(orgId, (barsHeldMap.get(orgId) ?? 0) + 1)
  }

  const mapped: Array<{
    org_id: string; org_name: string; org_type: string;
    war_score: number; bars_held: number; rank: number;
  }> = (orgs as any[]).map(o => {
    const warScore =
      (o.turf_wins ?? 0) * 3 +
      (o.wars_won ?? 0) * 5 +
      (o.sneak_attacks_repelled ?? 0) * 2 +
      (o.turf_streak_weeks ?? 0) * 2

    return {
      org_id: o.id,
      org_name: o.name,
      org_type: o.org_type,
      war_score: warScore,
      bars_held: barsHeldMap.get(o.id) ?? 0,
      rank: 0,
    }
  })

  // Sort by war_score descending and assign ranks
  mapped.sort((a, b) => b.war_score - a.war_score)
  mapped.forEach((entry, i) => { entry.rank = i + 1 })

  return ok(mapped)
}
