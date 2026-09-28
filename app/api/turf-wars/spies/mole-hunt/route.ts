import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getLedHandlers } from '@/lib/spy-handlers'

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

  // ─── Resolve mole hunt ───────────────────────────────────────────────────────
  // Leader only. Burns the suspect only if they really are a rival's active mole in the org;
  // a wrong guess spends the hunt and posts nothing public (Brian, Sep 28, 2026).
  if (body.mole_hunt_id && body.suspected_mole_id) {
    const { data, error } = await service.rpc('resolve_mole_hunt', {
      p_user: userId!,
      p_hunt: body.mole_hunt_id,
      p_suspect: body.suspected_mole_id,
    })
    if (error) {
      const m = error.message || ''
      if (m.includes('HUNT_NOT_FOUND')) return err('Mole hunt not found', 404)
      if (m.includes('HUNT_ALREADY_RESOLVED')) return err('Mole hunt is already resolved', 409)
      if (m.includes('NOT_ORG_LEADER')) return err('Only your org leader can resolve a mole hunt', 403)
      return err('Could not resolve the mole hunt', 500)
    }
    const status = (data as any)?.status
    return ok({
      mole_hunt_id: body.mole_hunt_id,
      status,
      message: status === 'mole_found'
        ? 'Mole burned. Their spy status is now public.'
        : 'No mole there. Your hunt is spent for this semester.',
    })
  }

  // ─── Activate a new mole hunt ───────────────────────────────────────────────
  if (!body.fake_bar_id) return err('fake_bar_id is required')
  if (!body.fake_event_date) return err('fake_event_date is required')
  if (!body.fake_claim_type || !['sneak_attack', 'war_declaration'].includes(body.fake_claim_type)) {
    return err('fake_claim_type must be sneak_attack or war_declaration')
  }

  // Only the org leader can plant false intelligence
  const led = await getLedHandlers(service, userId!)
  if (led.orgIds.length === 0) return err('Only your org leader can run a mole hunt', 403)

  const orgId = led.orgIds[0]

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
