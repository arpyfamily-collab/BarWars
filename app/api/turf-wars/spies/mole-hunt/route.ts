import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/spies/mole-hunt
 *
 * Activate a Mole Hunt: sends false intelligence to all org members.
 * Body: { fake_bar_id, fake_event_date, fake_claim_type }
 *
 * Resolve a Mole Hunt: marks a specific user as the suspected mole and burns them.
 * Body: { mole_hunt_id, suspected_mole_id }
 *
 * One mole hunt per org per semester.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Resolve mole hunt (burn the spy) ───────────────────────────────────────
  if (body.mole_hunt_id && body.suspected_mole_id) {
    const { data: hunt, error: huntErr } = await service
      .from('mole_hunts')
      .select('id, org_id, status')
      .eq('id', body.mole_hunt_id)
      .maybeSingle()

    if (huntErr) return err(huntErr.message, 500)
    if (!hunt) return err('Mole hunt not found', 404)

    const h = hunt as any
    if (h.status !== 'active') return err('Mole hunt is already resolved', 409)

    // Verify caller is org leadership
    const { data: membership } = await service
      .from('org_memberships')
      .select('role')
      .eq('org_id', h.org_id)
      .eq('user_id', userId!)
      .eq('verified', true)
      .maybeSingle()

    if (!membership) return err('Only org leadership can resolve a mole hunt', 403)

    const now = new Date().toISOString()

    // Mark mole hunt as resolved with mole found
    await service
      .from('mole_hunts')
      .update({ status: 'mole_found', suspected_mole_id: body.suspected_mole_id, resolved_at: now })
      .eq('id', body.mole_hunt_id)

    // Burn the spy — deactivate all their active assets
    await service
      .from('spy_assets')
      .update({ is_active: false, burned: true, burned_at: now, burned_by_org_id: h.org_id })
      .eq('asset_user_id', body.suspected_mole_id)

    // Award the "burned" badge — permanently visible on their profile
    await service
      .from('spy_badges')
      .insert({
        user_id: body.suspected_mole_id,
        badge_type: 'burned',
        awarded_by_org_id: h.org_id,
        detail: `Burned: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      })

    // Public announcement
    const { data: orgData } = await service
      .from('greek_orgs')
      .select('name')
      .eq('id', h.org_id)
      .single()

    await service.from('turf_events').insert({
      event_type: 'war_declared',
      org_id: h.org_id,
      headline: `MOLE BURNED — ${orgData?.name ?? 'An org'} exposed a spy in their ranks`,
      body: `A member of ${orgData?.name ?? 'an org'} was burned as a spy. The "Burned" badge is now permanently visible on their profile. In the Hessian world, this is a badge of honor. In the Greek world, it's a mark of shame.`,
      deep_link: '/turf-wars/spies',
      visible_to: 'public',
    })

    return ok({ mole_hunt_id: body.mole_hunt_id, status: 'mole_found', burned_user: body.suspected_mole_id })
  }

  // ─── Activate a new mole hunt ───────────────────────────────────────────────
  if (!body.fake_bar_id) return err('fake_bar_id is required')
  if (!body.fake_event_date) return err('fake_event_date is required')
  if (!body.fake_claim_type || !['sneak_attack', 'war_declaration'].includes(body.fake_claim_type)) {
    return err('fake_claim_type must be sneak_attack or war_declaration')
  }

  // Verify caller is verified org member
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified org member to run a mole hunt', 403)

  const orgId = (membership as any).org_id

  // Check for existing active mole hunt (one per semester — ~6 months)
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existingHunt } = await service
    .from('mole_hunts')
    .select('id, created_at')
    .eq('org_id', orgId)
    .gte('created_at', sixMonthsAgo)
    .maybeSingle()

  if (existingHunt) return err('Your org has already used a mole hunt this semester', 409)

  // Verify the bar exists
  const { data: bar } = await service
    .from('venues')
    .select('id, name')
    .eq('id', body.fake_bar_id)
    .maybeSingle()

  if (!bar) return err('Bar not found', 404)

  // Create the mole hunt
  const { data: hunt, error: huntErr } = await service
    .from('mole_hunts')
    .insert({
      org_id: orgId,
      fake_bar_id: body.fake_bar_id,
      fake_event_date: body.fake_event_date,
      fake_claim_type: body.fake_claim_type,
      status: 'active',
    })
    .select('id, status')
    .single()

  if (huntErr) return err(huntErr.message, 500)

  // Send false intelligence to all org members via turf events
  // The intel is visible to org members only — but any infiltrator will pass it to their handler
  await service.from('turf_events').insert({
    event_type: 'war_declared',
    org_id: orgId,
    bar_id: body.fake_bar_id,
    headline: `INTERNAL — Planning ${body.fake_claim_type === 'sneak_attack' ? 'Sneak Attack' : 'War Declaration'} on ${bar?.name}`,
    body: `Confidential planning notice. Target: ${bar?.name}. Date: ${new Date(body.fake_event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. This information is restricted to verified members. If this reaches rival hands, we have a mole.`,
    deep_link: '/turf-wars/spies',
    visible_to: 'orgs_only',
  })

  return ok({ ...hunt, message: 'Mole hunt activated. False intelligence has been planted. Watch for the leak.' }, 201)
}

/**
 * GET /api/turf-wars/spies/mole-hunt
 * Returns the caller's org's mole hunts (active and resolved).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return ok([])

  const { data, error } = await service
    .from('mole_hunts')
    .select(`
      id, status, fake_event_date, fake_claim_type, suspected_mole_id, created_at, resolved_at,
      bar:venues(name)
    `)
    .eq('org_id', (membership as any).org_id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
}
