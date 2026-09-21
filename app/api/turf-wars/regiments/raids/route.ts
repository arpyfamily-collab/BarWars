import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/regiments/raids
 * List open regiment raids.
 * - ?mine=true: raids posted by the caller's org
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  const service = createServiceClient()

  let query = service
    .from('regiment_raids')
    .select(`
      id, event_date, pitch, max_allies, status, window_open_at, window_close_at, created_at,
      org:greek_orgs(name, org_type),
      bar:venues(name)
    `)
    .order('event_date', { ascending: false })
    .limit(30)

  if (mine) {
    // Filter to caller's org
    const { userId, error: authErr } = await requireAuth()
    if (authErr) return authErr

    const { data: membership } = await service
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', userId!)
      .eq('verified', true)
      .maybeSingle()

    if (!membership) return ok([])
    query = query.eq('org_id', (membership as any).org_id)
  } else {
    query = query.eq('status', 'open')
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/turf-wars/regiments/raids
 * A verified Greek org member posts a Regiment Raid — an open invitation
 * for unaffiliated students to attend a bar event as Allies.
 *
 * Body: { bar_id, event_date, window_open_at, window_close_at, pitch, max_allies? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    bar_id: string
    event_date: string
    window_open_at: string
    window_close_at: string
    pitch?: string
    max_allies?: number
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.bar_id) return err('bar_id is required')
  if (!body.event_date) return err('event_date is required')
  if (!body.window_open_at || !body.window_close_at) return err('window_open_at and window_close_at are required')

  const start = new Date(body.window_open_at)
  const end = new Date(body.window_close_at)
  if (isNaN(start.getTime())) return err('Invalid window_open_at')
  if (isNaN(end.getTime())) return err('Invalid window_close_at')
  if (end <= start) return err('window_close_at must be after window_open_at')

  const service = createServiceClient()

  // Verify caller is a verified org member
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified org member to post a Regiment Raid', 403)

  // Verify bar exists
  const { data: bar } = await service
    .from('venues')
    .select('id, name')
    .eq('id', body.bar_id)
    .maybeSingle()

  if (!bar) return err('Bar not found', 404)

  const { data, error } = await service
    .from('regiment_raids')
    .insert({
      org_id: (membership as any).org_id,
      bar_id: body.bar_id,
      event_date: body.event_date,
      window_open_at: body.window_open_at,
      window_close_at: body.window_close_at,
      pitch: body.pitch ?? '',
      max_allies: body.max_allies ?? null,
      status: 'open',
    })
    .select('id, status, event_date')
    .single()

  if (error) return err(error.message, 500)

  // Public announcement
  const { data: orgData } = await service
    .from('greek_orgs')
    .select('name')
    .eq('id', (membership as any).org_id)
    .single()

  await service.from('turf_events').insert({
    event_type: 'war_declared',
    org_id: (membership as any).org_id,
    bar_id: body.bar_id,
    headline: `REGIMENT RAID — ${orgData?.name ?? 'An org'} is opening its doors at ${bar?.name}`,
    body: body.pitch || `${orgData?.name ?? 'An org'} invites unaffiliated students to come see what they're about. Show up, check in as an Ally, and experience the vibe. No commitment, no pressure.`,
    deep_link: '/turf-wars/regiments',
    visible_to: 'public',
  })

  return ok(data, 201)
}
