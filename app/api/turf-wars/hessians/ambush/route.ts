import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/hessians/ambush
 *
 * A Hessian Captain declares an ambush on a Greek org's turf.
 * Requirements:
 * - The target org must be in a vulnerable state (missed maintenance / warning)
 * - The bar must have active turf (held by a Greek org)
 * - The ambush window is 90 minutes, opening 1 hour from declaration
 * - On success: the target org's turf goes to Contested Status for 72 hours
 *   (rival orgs can file accelerated War Declarations — 24hr notice)
 *
 * Body: { target_bar_id: string }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { target_bar_id: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.target_bar_id) return err('target_bar_id is required')

  const service = createServiceClient()

  // Verify caller is a Hessian Captain
  const { data: company } = await service
    .from('hessian_companies')
    .select('id, name, member_count, captain_id, ambushes_won')
    .eq('captain_id', userId!)
    .maybeSingle()

  if (!company) return err('Only Hessian Captains can declare ambushes', 403)

  const compAny = company as any

  // Must have at least 5 verified members
  const { data: members, error: memberErr } = await service
    .from('hessian_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', compAny.id)
    .eq('verified', true)

  if (memberErr) return err(memberErr.message, 500)

  const verifiedCount = (members as any)?.length ?? 0
  if (verifiedCount < 5) {
    return err(`Your company needs at least 5 verified members to ambush (you have ${verifiedCount})`, 422)
  }

  // Find the Greek org holding this bar
  const { data: targetOrg } = await service
    .from('greek_orgs')
    .select('id, name, home_turf_bar_id, turf_streak_weeks, turf_contested_until')
    .eq('home_turf_bar_id', body.target_bar_id)
    .maybeSingle()

  if (!targetOrg) return err('No Greek org currently holds this bar', 422)

  const targetAny = targetOrg as any

  // Check if already contested
  if (targetAny.turf_contested_until && new Date(targetAny.turf_contested_until) > new Date()) {
    return err('This turf is already in Contested Status', 409)
  }

  // Check for existing active ambush by this company on this bar
  const { data: existingAmbush } = await service
    .from('hessian_ambushes')
    .select('id, status')
    .eq('company_id', compAny.id)
    .eq('target_bar_id', body.target_bar_id)
    .in('status', ['declared', 'live'])
    .maybeSingle()

  if (existingAmbush) return err('Your company already has an active ambush on this bar', 409)

  // Set up the ambush window: opens 1 hour from now, 90 minutes long
  const now = new Date()
  const windowOpens = new Date(now.getTime() + 60 * 60 * 1000)
  const windowCloses = new Date(windowOpens.getTime() + 90 * 60 * 1000)

  // Required headcount: 10 or 80% of roster, whichever is lower
  const requiredHeadcount = Math.min(10, Math.ceil(verifiedCount * 0.8))

  const { data: ambush, error: insertErr } = await service
    .from('hessian_ambushes')
    .insert({
      company_id: compAny.id,
      target_bar_id: body.target_bar_id,
      target_org_id: targetAny.id,
      status: 'declared',
      window_open_at: windowOpens.toISOString(),
      window_close_at: windowCloses.toISOString(),
      required_headcount: requiredHeadcount,
    })
    .select('id, status, window_open_at, window_close_at, required_headcount')
    .single()

  if (insertErr) return err(insertErr.message, 500)

  // Fetch bar name for the event
  const { data: bar } = await service
    .from('venues')
    .select('name')
    .eq('id', body.target_bar_id)
    .single()

  // Public announcement — the ambush declaration
  await service.from('turf_events').insert({
    event_type: 'war_declared',
    org_id: targetAny.id,
    bar_id: body.target_bar_id,
    headline: `AMBUSH — ${compAny.name} is coming for ${targetAny.name}'s turf at ${bar?.name ?? 'a bar'}`,
    body: `${compAny.name} has declared an ambush. If they reach ${requiredHeadcount} members at the bar within the 90-minute window, ${targetAny.name}'s turf goes to Contested Status for 72 hours. Rivals can then file accelerated War Declarations.`,
    deep_link: '/turf-wars',
    visible_to: 'public',
  })

  return ok(ambush, 201)
}

/**
 * GET /api/turf-wars/hessians/ambush?status=active
 * List active ambushes.
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const service = createServiceClient()

  let query = service
    .from('hessian_ambushes')
    .select(`
      id, status, window_open_at, window_close_at, hessian_headcount,
      required_headcount, created_at, resolved_at,
      company:hessian_companies(name),
      bar:venues(name),
      target_org:greek_orgs(name)
    `)
    .order('created_at', { ascending: false })
    .limit(30)

  if (status === 'active') {
    query = query.in('status', ['declared', 'live'])
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}
