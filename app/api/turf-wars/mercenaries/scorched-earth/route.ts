import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

const SCORCHED_CODEnames = ['Inferno', 'Wildcard', 'Reckoning', 'Apex', 'Titan', 'Banshee', 'Cataclysm', 'Sovereign', 'Maverick', 'Phoenix']

function generateCodename(): string {
  const base = SCORCHED_CODEnames[Math.floor(Math.random() * SCORCHED_CODEnames.length)]
  const year = new Date().getFullYear()
  return `${base}${year}`
}

/**
 * GET /api/turf-wars/mercenaries/scorched-earth
 * - No params: returns all announced + live scorched earth events (public spectacle)
 * - ?mine=true: returns the caller's scorched earth events
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  const service = createServiceClient()

  if (mine) {
    const { data, error } = await service
      .from('scorched_earth_events')
      .select(`
        id, codename, event_date, side, status, war_bond_reward, created_at, resolved_at,
        bar:venues(name),
        org:greek_orgs(name),
        company:hessian_companies(name)
      `)
      .eq('senior_user_id', userId!)
      .order('created_at', { ascending: false })

    if (error) return err(error.message, 500)
    return ok(data)
  }

  // Public listing — only announced and live events
  const { data, error } = await service
    .from('scorched_earth_events')
    .select(`
      id, codename, event_date, side, status, war_bond_reward, created_at,
      bar:venues(name),
      org:greek_orgs(name),
      company:hessian_companies(name)
    `)
    .in('status', ['announced', 'live'])
    .order('event_date', { ascending: true })
    .limit(10)

  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/turf-wars/mercenaries/scorched-earth
 *
 * Declare a Scorched Earth event (graduating senior):
 *   { target_bar_id, event_date, side, allied_org_id?, allied_company_id? }
 *   One-time per user. Generates a codename automatically.
 *
 * Resolve a Scorched Earth event (self-resolution):
 *   { event_id, result: 'victorious' | 'defeated' }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Resolve ────────────────────────────────────────────────────────────────
  if (body.event_id && body.result) {
    if (!['victorious', 'defeated'].includes(body.result)) return err('result must be victorious or defeated')

    const { data: event } = await service
      .from('scorched_earth_events')
      .select('id, status, senior_user_id, war_bond_reward')
      .eq('id', body.event_id)
      .maybeSingle()

    if (!event) return err('Scorched Earth event not found', 404)
    const e = event as any
    if (e.senior_user_id !== userId) return err('Only the senior can resolve their event', 403)
    if (e.status === 'victorious' || e.status === 'defeated') return err('Event already resolved', 409)

    const now = new Date().toISOString()
    await service
      .from('scorched_earth_events')
      .update({ status: body.result, resolved_at: now })
      .eq('id', body.event_id)

    // Award war bonds (victory = full reward, defeat = participation bonds)
    const bonds = body.result === 'victorious' ? e.war_bond_reward : 10
    await service
      .from('war_bond_ledger')
      .insert({
        user_id: userId!,
        amount: bonds,
        reason: body.result === 'victorious' ? 'scorched_earth_victory' : 'scorched_earth_participation',
        reference_id: e.id,
      })

    // Update mercenary war_bonds if they have a profile
    const { data: merc } = await service
      .from('mercenaries')
      .select('id, war_bonds')
      .eq('user_id', userId!)
      .maybeSingle()
    if (merc) {
      await service
        .from('mercenaries')
        .update({ war_bonds: (merc as any).war_bonds + bonds })
        .eq('id', (merc as any).id)
    }

    // Public announcement — permanent record
    const { data: barData } = await service
      .from('venues')
      .select('name')
      .eq('id', (event as any).target_bar_id ?? (event as any).bar_id)
      .single()

    const headline = body.result === 'victorious'
      ? `SCORCHED EARTH CHAMPION — ${e.codename} conquered ${barData?.name ?? 'the bar'}`
      : `${e.codename} went down swinging at ${barData?.name ?? 'the bar'}`

    await service.from('turf_events').insert({
      event_type: 'war_declared',
      bar_id: (event as any).target_bar_id ?? (event as any).bar_id,
      headline,
      body: body.result === 'victorious'
        ? `${e.codename} declared Scorched Earth and won. "Scorched Earth Champion — Class of ${new Date().getFullYear()}." A permanent legacy.`
        : `${e.codename} declared Scorched Earth and lost. "Went down swinging — Class of ${new Date().getFullYear()}." Both outcomes are honorable. The failure badge is almost better — it means they tried something audacious.`,
      deep_link: '/turf-wars/mercenaries',
      visible_to: 'public',
    })

    return ok({
      event_id: body.event_id,
      status: body.result,
      war_bonds_earned: bonds,
      badge: body.result === 'victorious' ? 'Scorched Earth Champion' : 'Went Down Swinging',
    })
  }

  // ─── Declare ────────────────────────────────────────────────────────────────
  if (!body.target_bar_id) return err('target_bar_id is required')
  if (!body.event_date) return err('event_date is required')
  if (!body.side || !['self', 'attacker', 'defender'].includes(body.side)) {
    return err('side must be self, attacker, or defender')
  }

  // One-time per user
  const { data: existing } = await service
    .from('scorched_earth_events')
    .select('id')
    .eq('senior_user_id', userId!)
    .maybeSingle()

  if (existing) return err('You can only declare Scorched Earth once. You already have an event.', 409)

  // Verify bar exists
  const { data: bar } = await service
    .from('venues')
    .select('id, name')
    .eq('id', body.target_bar_id)
    .maybeSingle()

  if (!bar) return err('Bar not found', 404)

  // Event date must be within 30 days (final semester window)
  const eventDate = new Date(body.event_date)
  const now = new Date()
  const daysOut = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (daysOut < 1) return err('Scorched Earth must be declared at least 1 day in advance', 422)
  if (daysOut > 30) return err('Scorched Earth must be within 30 days', 422)

  // Generate unique codename
  let codename = generateCodename()
  for (let i = 0; i < 5; i++) {
    const { data: existingName } = await service
      .from('scorched_earth_events')
      .select('id')
      .eq('codename', codename)
      .maybeSingle()
    if (!existingName) break
    codename = generateCodename()
  }

  const { data, error } = await service
    .from('scorched_earth_events')
    .insert({
      senior_user_id: userId!,
      codename,
      target_bar_id: body.target_bar_id,
      event_date: body.event_date,
      side: body.side,
      allied_org_id: body.allied_org_id ?? null,
      allied_company_id: body.allied_company_id ?? null,
      status: 'announced',
      war_bond_reward: 20,
    })
    .select('id, codename, event_date, status')
    .single()

  if (error) return err(error.message, 500)

  // Public announcement — 7-day banner
  await service.from('turf_events').insert({
    event_type: 'war_declared',
    bar_id: body.target_bar_id,
    headline: `SCORCHED EARTH — ${codename} is going out in flames at ${bar?.name}`,
    body: `${codename} has declared Scorched Earth on ${new Date(body.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. One night. One bar. No faction restrictions. Any org, any Hessian Company, any student can participate on either side. Win or lose, the result is permanent.`,
    deep_link: '/turf-wars/mercenaries',
    visible_to: 'public',
  })

  return ok({ ...data, message: `Scorched Earth declared. Your codename is ${codename}. The event is announced publicly. Go out in flames.` }, 201)
}
