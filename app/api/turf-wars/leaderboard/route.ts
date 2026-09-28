import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/leaderboard[?division=small|mid|large]
 * Orgs ranked by war points (Testing To-Do item 20): 1 per win, x1.5 for beating an org at least
 * 1.5x your size (underdog), x0.8 while on a 4+ week streak. Awarded by the war referee.
 * Divisions by verified size so every org has a title it can win: Small under 40, Mid 40-99, Large 100+.
 */
function divisionOf(size: number): 'small' | 'mid' | 'large' {
  return size >= 100 ? 'large' : size >= 40 ? 'mid' : 'small'
}

export async function GET(req: NextRequest) {
  const service = createServiceClient()
  const division = req.nextUrl.searchParams.get('division')

  const { data: orgs, error } = await service
    .from('greek_orgs')
    .select('id, name, org_type, verified_member_count, war_points, turf_wins, turf_losses, turf_streak_weeks, home_turf_bar_id')
    .limit(500)
  if (error || !orgs) return ok([])

  const rows = (orgs as any[])
    .map(o => ({
      org_id: o.id,
      org_name: o.name,
      org_type: o.org_type,
      size: o.verified_member_count ?? 0,
      division: divisionOf(o.verified_member_count ?? 0),
      war_score: Number(o.war_points ?? 0),     // war points (kept as war_score for existing screens)
      wins: o.turf_wins ?? 0,
      losses: o.turf_losses ?? 0,
      streak_weeks: o.turf_streak_weeks ?? 0,
      bars_held: o.home_turf_bar_id ? 1 : 0,    // bars held right now
      rank: 0,
    }))
    .filter(r => !division || r.division === division)
    .sort((a, b) => b.war_score - a.war_score || b.wins - a.wins || a.losses - b.losses)
    .slice(0, 20)

  rows.forEach((r, i) => { r.rank = i + 1 })
  return ok(rows)
}
