import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/regiments
 * Form a new Regiment from a cluster of mutually-linked users.
 * Body: { name: string, member_user_ids: string[] }
 * The caller becomes Captain. Must have at least 4 other members (5 total).
 * All members must be mutually linked with the caller.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { name: string; member_user_ids: string[] }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.name) return err('Regiment name is required')
  if (body.name.length < 3) return err('Name must be at least 3 characters')
  if (!body.member_user_ids || body.member_user_ids.length < 4) {
    return err('A Regiment needs at least 5 total members (you + 4 others)')
  }
  body.member_user_ids = Array.from(new Set(body.member_user_ids.filter(id => id && id !== userId)))
  if (body.member_user_ids.length < 4) return err('A Regiment needs at least 5 total members (you + 4 others)')
  if (body.member_user_ids.length > 9) return err('A Regiment has at most 10 members: you plus 9 companions', 422)

  const service = createServiceClient()

  // Check caller isn't already in a regiment
  const { data: existingReg } = await service
    .from('regiment_members')
    .select('id')
    .eq('user_id', userId!)
    .maybeSingle()
  if (existingReg) return err('You are already in a Regiment', 409)

  // Check name uniqueness
  const { data: existingName } = await service
    .from('regiments')
    .select('id')
    .eq('name', body.name)
    .maybeSingle()
  if (existingName) return err('A Regiment with this name already exists', 409)

  // Verify all proposed members are mutually linked with the caller
  const memberIds = [...body.member_user_ids, userId!]
  for (const memberId of body.member_user_ids) {
    const { data: link } = await service
      .from('regiment_links')
      .select('id, status')
      .or(`and(user_a.eq.${userId},user_b.eq.${memberId}),and(user_a.eq.${memberId},user_b.eq.${userId})`)
      .eq('status', 'linked')
      .maybeSingle()

    if (!link) return err(`You are not mutually linked with user ${memberId}`, 422)
  }

  // Create the Regiment
  const { data: regiment, error: regErr } = await service
    .from('regiments')
    .insert({
      name: body.name,
      captain_id: userId!,
      member_count: memberIds.length,
    })
    .select('id, name, created_at')
    .single()

  if (regErr) { const e = factionError(regErr.message); return err(e.message, e.status) }

  const regId = (regiment as any).id

  // Add all members
  const memberRows = memberIds.map(uid => ({
    regiment_id: regId,
    user_id: uid,
    role: uid === userId ? 'captain' as const : 'member' as const,
  }))

  const { error: memberErr } = await service
    .from('regiment_members')
    .insert(memberRows)

  if (memberErr) {
    // Someone in the crew is blocked by a faction rule: don't leave an empty Regiment behind
    await service.from('regiments').delete().eq('id', regId)
    const e = factionError(memberErr.message)
    return err(e.message, e.status)
  }

  // Mark the captain's finder profile as no longer looking
  await service
    .from('regiment_finder_profiles')
    .update({ is_looking: false })
    .eq('user_id', userId!)

  return ok(regiment, 201)
}

/**
 * GET /api/turf-wars/regiments
 * - No params: list all regiments (directory)
 * - ?mine=true: return the caller's regiment with members
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  const service = createServiceClient()

  if (mine) {
    const { data: myMembership } = await service
      .from('regiment_members')
      .select('regiment_id, role')
      .eq('user_id', userId!)
      .maybeSingle()

    if (!myMembership) return ok(null)

    const regId = (myMembership as any).regiment_id

    const { data: regiment } = await service
      .from('regiments')
      .select('id, name, member_count, converted_to_hessian, hessian_company_id, created_at')
      .eq('id', regId)
      .maybeSingle()

    const { data: members } = await service
      .from('regiment_members')
      .select('id, user_id, role, joined_at')
      .eq('regiment_id', regId)
      .order('joined_at', { ascending: true })

    return ok({ regiment, members })
  }

  const { data, error } = await service
    .from('regiments')
    .select('id, name, member_count, converted_to_hessian, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return err(error.message, 500)
  return ok(data)
}
