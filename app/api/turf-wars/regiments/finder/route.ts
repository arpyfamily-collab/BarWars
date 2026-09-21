import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/regiments/finder
 * - No params: returns the caller's finder profile (or null)
 * - ?matches=true: returns suggested matches (compatible unaffiliated users)
 *
 * POST /api/turf-wars/regiments/finder
 * Create or update the caller's finder profile.
 * Body: { nights_out, vibe, situation, pitch, is_looking? }
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const wantMatches = searchParams.get('matches') === 'true'

  const service = createServiceClient()

  if (!wantMatches) {
    const { data } = await service
      .from('regiment_finder_profiles')
      .select('*')
      .eq('user_id', userId!)
      .maybeSingle()
    return ok(data)
  }

  // Get the caller's profile for matching
  const { data: myProfile } = await service
    .from('regiment_finder_profiles')
    .select('nights_out, vibe, situation')
    .eq('user_id', userId!)
    .maybeSingle()

  if (!myProfile) return err('Create your finder profile first', 404)

  // Get IDs of users already linked or pending with caller
  const { data: existingLinks } = await service
    .from('regiment_links')
    .select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)

  const linkedIds = new Set<string>([userId!])
  for (const link of (existingLinks as any[]) ?? []) {
    if (link.user_a === userId) linkedIds.add(link.user_b)
    if (link.user_b === userId) linkedIds.add(link.user_a)
  }

  // Find compatible profiles: same nights_out or same vibe, excluding linked users
  const myAny = myProfile as any
  const { data: matches } = await service
    .from('regiment_finder_profiles')
    .select('user_id, nights_out, vibe, situation, pitch')
    .eq('is_looking', true)
    .neq('user_id', userId!)
    .or(`nights_out.eq.${myAny.nights_out},vibe.eq.${myAny.vibe}`)
    .limit(10)

  // Filter out already-linked and score by compatibility
  const filtered = ((matches as any[]) ?? [])
    .filter(m => !linkedIds.has(m.user_id))
    .map(m => {
      let score = 0
      if (m.nights_out === myAny.nights_out) score += 3
      if (m.vibe === myAny.vibe) score += 2
      if (m.situation === myAny.situation) score += 1
      return { ...m, compatibility_score: score }
    })
    .sort((a, b) => b.compatibility_score - a.compatibility_score)
    .slice(0, 5)

  return ok(filtered)
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    nights_out: string
    vibe: string
    situation: string
    pitch?: string
    is_looking?: boolean
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.nights_out) return err('nights_out is required')
  if (!['mon_thu', 'fri_sat', 'both'].includes(body.nights_out)) return err('Invalid nights_out')
  if (!body.vibe) return err('vibe is required')
  if (!['trivia', 'live_music', 'just_vibing', 'wherever', 'in_the_action'].includes(body.vibe)) return err('Invalid vibe')
  if (!body.situation) return err('situation is required')
  if (!['new_to_town', 'transfer', 'no_crew', 'friends_graduated'].includes(body.situation)) return err('Invalid situation')

  const service = createServiceClient()

  // Check if profile exists
  const { data: existing } = await service
    .from('regiment_finder_profiles')
    .select('id')
    .eq('user_id', userId!)
    .maybeSingle()

  if (existing) {
    const { data, error } = await service
      .from('regiment_finder_profiles')
      .update({
        nights_out: body.nights_out,
        vibe: body.vibe,
        situation: body.situation,
        pitch: body.pitch ?? '',
        is_looking: body.is_looking ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId!)
      .select('*')
      .single()
    if (error) return err(error.message, 500)
    return ok(data)
  }

  const { data, error } = await service
    .from('regiment_finder_profiles')
    .insert({
      user_id: userId!,
      nights_out: body.nights_out,
      vibe: body.vibe,
      situation: body.situation,
      pitch: body.pitch ?? '',
      is_looking: body.is_looking ?? true,
    })
    .select('*')
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}
