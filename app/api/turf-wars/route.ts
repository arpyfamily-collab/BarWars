import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * GET /api/turf-wars — list turf claims (filtered by status)
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  const service = createServiceClient()

  let query = service
    .from('turf_claims')
    .select(`
      id, claim_type, status, window_open_at, window_close_at,
      required_headcount, attacker_verified_headcount, defender_verified_headcount,
      created_at,
      attacking_org:greek_orgs!attacking_org_id(name, org_type),
      defending_org:greek_orgs!defending_org_id(name, org_type),
      bar:venues(name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  } else {
    query = query.in('status', ['pending', 'operator_pending', 'live', 'successful', 'failed', 'contested'])
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)

  return ok(data)
}

/**
 * POST /api/turf-wars — create a new turf claim
 *
 * An authenticated user who is a verified member of a Greek org can:
 *   - file an initial_claim on a neutral bar
 *   - file a sneak_attack on a bar held by another org (Mon–Thu only)
 *   - file a war_declaration on a bar held by another org (requires operator approval)
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    claim_type: string
    bar_id: string
    window_open_at: string
    window_close_at: string
    required_headcount: number
    is_rush_event?: boolean
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  // Validate
  if (!body.claim_type) return err('claim_type is required')
  if (!['initial_claim', 'sneak_attack', 'war_declaration'].includes(body.claim_type)) {
    return err('claim_type must be initial_claim, sneak_attack, or war_declaration')
  }
  if (!body.bar_id) return err('bar_id is required')
  if (!body.window_open_at || !body.window_close_at) return err('window_open_at and window_close_at are required')
  if (!body.required_headcount || body.required_headcount < 1) return err('required_headcount must be at least 1')

  const start = new Date(body.window_open_at)
  const end   = new Date(body.window_close_at)
  const now   = new Date()

  if (isNaN(start.getTime())) return err('window_open_at is not a valid date')
  if (isNaN(end.getTime()))   return err('window_close_at is not a valid date')
  if (start <= now)           return err('window_open_at must be in the future')
  if (end <= start)           return err('window_close_at must be after window_open_at')

  const durationHours = (end.getTime() - start.getTime()) / 3_600_000
  if (durationHours < 2) return err('Claim window must be at least 2 hours')
  if (durationHours > 4) return err('Claim window cannot exceed 4 hours')

  // Sneak attacks only on Mon–Thu (days 1–4)
  if (body.claim_type === 'sneak_attack') {
    const dayOfWeek = start.getDay()
    if (dayOfWeek < 1 || dayOfWeek > 4) {
      return err('Sneak attacks can only be scheduled Monday through Thursday', 422)
    }
  }

  // War declarations only on Fri–Sat (days 5–6)
  if (body.claim_type === 'war_declaration') {
    const dayOfWeek = start.getDay()
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      return err('War declarations can only be scheduled on Friday or Saturday', 422)
    }
  }

  const service = createServiceClient()

  // Find the caller's verified org membership
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id, role, verified, greek_orgs!org_id(name, verified_member_count, home_turf_bar_id)')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified member of a Greek org to file a turf claim', 403)

  const org = membership.greek_orgs as any
  if (!org) return err('Greek org not found', 404)

  // Verify the bar exists
  const { data: bar } = await service
    .from('venues')
    .select('id, name')
    .eq('id', body.bar_id)
    .maybeSingle()

  if (!bar) return err('Bar not found', 404)

  // Check for existing active/pending claims on this bar
  const { data: existing } = await service
    .from('turf_claims')
    .select('id, status')
    .eq('bar_id', body.bar_id)
    .in('status', ['pending', 'operator_pending', 'live'])
    .maybeSingle()

  if (existing) {
    return err('There is already an active turf claim on this bar', 409)
  }

  // Determine defending org and initial status
  let defendingOrgId: string | null = null
  let initialStatus: string = 'pending'

  if (body.claim_type === 'initial_claim') {
    // Bar must be neutral (no org holds it)
    if (org.home_turf_bar_id) {
      // The claiming org already holds a bar — they can't claim another
      return err('Your org already holds home turf — you cannot file an initial claim', 422)
    }

    // Check if any org holds this bar
    const { data: holder } = await service
      .from('greek_orgs')
      .select('id')
      .eq('home_turf_bar_id', body.bar_id)
      .maybeSingle()

    if (holder) {
      return err('This bar is already claimed — file a sneak attack or war declaration instead', 409)
    }
  } else {
    // sneak_attack or war_declaration — bar must be held by another org
    const { data: holder } = await service
      .from('greek_orgs')
      .select('id, name')
      .eq('home_turf_bar_id', body.bar_id)
      .maybeSingle()

    if (!holder) {
      return err('This bar is not currently held by any org — file an initial claim instead', 422)
    }

    if (holder.id === (membership as any).org_id) {
      return err('Your org already holds this bar', 422)
    }

    defendingOrgId = holder.id

    // War declarations require operator approval
    if (body.claim_type === 'war_declaration') {
      initialStatus = 'operator_pending'
    }
  }

  // Insert the claim
  const { data: claim, error: insertError } = await service
    .from('turf_claims')
    .insert({
      claim_type: body.claim_type,
      attacking_org_id: (membership as any).org_id,
      defending_org_id: defendingOrgId,
      bar_id: body.bar_id,
      status: initialStatus,
      window_open_at: body.window_open_at,
      window_close_at: body.window_close_at,
      required_headcount: body.required_headcount,
    })
    .select('id, claim_type, status, window_open_at, window_close_at, required_headcount')
    .single()

  if (insertError) return err(insertError.message, 500)

  // If this is a rush event, create the rush_events record
  if (body.is_rush_event) {
    await service.from('rush_events').insert({
      claim_id: (claim as any).id,
      org_id: (membership as any).org_id,
      is_rush_event: true,
    })
  }

  // Log a turf event
  const eventType = body.claim_type === 'initial_claim' ? 'claim_announced'
    : body.claim_type === 'sneak_attack' ? 'sneak_attack_detected'
    : 'war_declared'

  const headline = body.claim_type === 'initial_claim'
    ? `${org.name} announced a claim on ${bar.name}`
    : body.claim_type === 'sneak_attack'
    ? `${org.name} launched a sneak attack on ${bar.name}`
    : `${org.name} declared war on ${bar.name}`

  const visibility = body.claim_type === 'sneak_attack' ? 'orgs_only' : 'public'

  await service.from('turf_events').insert({
    claim_id: (claim as any).id,
    event_type: eventType,
    org_id: (membership as any).org_id,
    bar_id: body.bar_id,
    headline,
    deep_link: `/turf-wars/${(claim as any).id}`,
    visible_to: visibility,
  })

  return ok(claim, 201)
}
