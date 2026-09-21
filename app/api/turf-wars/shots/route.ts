import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * GET /api/turf-wars/shots — list shots fired (filtered by bar or org)
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const barId = searchParams.get('bar_id')
  const orgId = searchParams.get('org_id')
  const status = searchParams.get('status')

  const service = createServiceClient()

  let query = service
    .from('shots_fired')
    .select(`
      id, status, shots_count, confirmed_at, expires_at, created_at, org_id, bar_id,
      surge_fee_cents, surge_fee_paid,
      attack_window_opens_at, attack_window_closes_at,
      attacker_to_arms_at, defender_to_arms_at,
      org:greek_orgs(name, org_type),
      bar:venues(name)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (barId) query = query.eq('bar_id', barId)
  if (orgId) query = query.eq('org_id', orgId)
  if (status) query = query.eq('status', status)

  // Public sees only confirmed/expired/stand_down; org members see their own pending
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (membership) {
    query = query.or(`status.in.(confirmed,expired,stand_down),org_id.eq.${(membership as any).org_id}`)
  } else {
    query = query.in('status', ['confirmed', 'expired', 'stand_down'])
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/turf-wars/shots — fire shots at a bar
 *
 * Rate limits enforced:
 * - Max 3 sneak attacks (shots fired) per org per rolling 30-day period
 * - Max 1 per bar per 14 days (cooldown regardless of outcome)
 * - Stand-downs and expired shots count as used attacks
 *
 * Surge fee: if the bar has turf_surge_fee_cents > 0, the org must pay
 * that fee at filing time. The fee is recorded on the shots_fired row.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { bar_id: string; shots_count: number; receipt_photo_url?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.bar_id) return err('bar_id is required')
  if (!body.shots_count || body.shots_count < 1) return err('shots_count must be at least 1')

  const service = createServiceClient()

  // Find the caller's verified org membership
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id, greek_orgs!org_id(name)')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified member of a Greek org to fire shots', 403)

  const orgId = (membership as any).org_id

  // Verify the bar exists and has turf enabled
  const { data: bar } = await service
    .from('venues')
    .select('id, name, turf_enabled, turf_shots_min, turf_sneak_attack_nights, turf_surge_fee_cents')
    .eq('id', body.bar_id)
    .maybeSingle()

  if (!bar) return err('Bar not found', 404)
  if (!(bar as any).turf_enabled) return err('This bar has not enabled turf wars', 422)

  // Weekday check — shots fired only on designated sneak attack nights
  const now = new Date()
  const dayOfWeek = now.getDay()
  const allowedNights = (bar as any).turf_sneak_attack_nights ?? [1, 2, 3, 4]
  if (!allowedNights.includes(dayOfWeek)) {
    return err('Shots can only be fired on designated sneak attack nights (Mon–Thu)', 422)
  }

  // Check minimum shots threshold
  const minShots = (bar as any).turf_shots_min ?? 10
  if (body.shots_count < minShots) {
    return err(`Minimum ${minShots} shots required at this bar`, 422)
  }

  // Check for existing active shots by this org at this bar
  const { data: existing } = await service
    .from('shots_fired')
    .select('id')
    .eq('org_id', orgId)
    .eq('bar_id', body.bar_id)
    .in('status', ['pending_confirmation', 'confirmed'])
    .maybeSingle()

  if (existing) {
    return err('Your org already has active shots at this bar', 409)
  }

  // ─── RATE LIMIT 1: Max 3 sneak attacks per org per rolling 30 days ───────────
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentShots, error: rateErr1 } = await service
    .from('shots_fired')
    .select('id, status', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', thirtyDaysAgo)
    .in('status', ['confirmed', 'expired', 'stand_down'])

  if (rateErr1) return err(rateErr1.message, 500)
  const recentCount = (recentShots as any)?.length ?? 0
  if (recentCount >= 3) {
    return err('Your org has used all 3 sneak attacks in the last 30 days. Rate limit resets as the oldest attack passes 30 days.', 429)
  }

  // ─── RATE LIMIT 2: Max 1 per bar per 14 days (cooldown) ──────────────────────
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: barCooldown } = await service
    .from('shots_fired')
    .select('id, status, created_at')
    .eq('org_id', orgId)
    .eq('bar_id', body.bar_id)
    .gte('created_at', fourteenDaysAgo)
    .in('status', ['confirmed', 'expired', 'stand_down'])
    .maybeSingle()

  if (barCooldown) {
    const cooldownDate = new Date((barCooldown as any).created_at)
    const eligibleAt = new Date(cooldownDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    return err(`Your org attacked this bar within the last 14 days. Cooldown expires ${eligibleAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`, 429)
  }

  // ─── Surge fee ──────────────────────────────────────────────────────────────
  const surgeFeeCents = (bar as any).turf_surge_fee_cents ?? 0

  // Insert the shots fired record
  const { data: shot, error: insertError } = await service
    .from('shots_fired')
    .insert({
      org_id: orgId,
      bar_id: body.bar_id,
      shots_count: body.shots_count,
      receipt_photo_url: body.receipt_photo_url ?? null,
      surge_fee_cents: surgeFeeCents,
      surge_fee_paid: surgeFeeCents === 0, // no fee = trivially paid
      expires_at: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, status, shots_count, expires_at, surge_fee_cents')
    .single()

  if (insertError) return err(insertError.message, 500)

  // Increment org's shots_fired_count
  await service.rpc('increment_shots_fired_count', { p_org_id: orgId }).maybeSingle()

  // Update last_sneak_attack_at
  await service
    .from('greek_orgs')
    .update({ last_sneak_attack_at: now.toISOString() })
    .eq('id', orgId)

  return ok({
    ...shot,
    surge_fee_required: surgeFeeCents > 0,
    surge_fee_cents: surgeFeeCents,
  }, 201)
}
