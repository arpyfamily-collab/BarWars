import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/spies/cultivate
 *
 * Send a cultivation request to a bar asset or Hessian member.
 * Body: { target_user_id, offer_type, offer_detail? }
 *
 * Respond to a cultivation request (as the target):
 * Body: { cultivation_id, action: 'accept' | 'decline' }
 *
 * Rate intel quality (as cultivator, after event resolves):
 * Body: { cultivation_id, rating: 1-5 }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Respond to cultivation ─────────────────────────────────────────────────
  if (body.cultivation_id && body.action) {
    const { data: cult, error: cultErr } = await service
      .from('spy_cultivations')
      .select('id, status, target_user_id')
      .eq('id', body.cultivation_id)
      .maybeSingle()

    if (cultErr) return err(cultErr.message, 500)
    if (!cult) return err('Cultivation not found', 404)

    const c = cult as any
    if (c.status !== 'pending') return err(`Already ${c.status}`, 409)
    if (c.target_user_id !== userId) return err('Only the target can respond', 403)

    if (!['accept', 'decline'].includes(body.action)) return err('Invalid action')

    const now = new Date().toISOString()
    await service
      .from('spy_cultivations')
      .update({ status: body.action, resolved_at: now })
      .eq('id', body.cultivation_id)

    if (body.action === 'accept') {
      // Check if this user already has a spy asset with another org (double agent)
      const { data: existingAssets } = await service
        .from('spy_assets')
        .select('id, handler_org_id, handler_company_id')
        .eq('asset_user_id', userId!)
        .eq('is_active', true)

      const activeAssets = (existingAssets as any[]) ?? []
      const isDoubleAgent = activeAssets.length >= 1

      // Get the cultivation to find the cultivator
      const { data: cultDetail } = await service
        .from('spy_cultivations')
        .select('cultivator_type, cultivator_org_id, cultivator_company_id')
        .eq('id', body.cultivation_id)
        .single()

      const cd = cultDetail as any

      await service
        .from('spy_assets')
        .insert({
          asset_user_id: userId!,
          handler_type: cd.cultivator_type,
          handler_org_id: cd.cultivator_org_id,
          handler_company_id: cd.cultivator_company_id,
          spy_type: isDoubleAgent ? 'double_agent' : 'bar_asset',
          is_active: true,
        })

      // If now a double agent, update all active assets to reflect it
      if (isDoubleAgent) {
        await service
          .from('spy_assets')
          .update({ spy_type: 'double_agent' })
          .eq('asset_user_id', userId!)
          .eq('is_active', true)
      }

      return ok({ id: body.cultivation_id, status: 'accepted', spy_type: isDoubleAgent ? 'double_agent' : 'bar_asset' })
    }

    return ok({ id: body.cultivation_id, status: 'declined' })
  }

  // ─── Rate intel quality ─────────────────────────────────────────────────────
  if (body.cultivation_id && body.rating) {
    if (body.rating < 1 || body.rating > 5) return err('Rating must be 1-5')

    const { data: cult } = await service
      .from('spy_cultivations')
      .select('id, cultivator_org_id, cultivator_company_id')
      .eq('id', body.cultivation_id)
      .maybeSingle()
    if (!cult) return err('Cultivation not found', 404)

    // Verify caller is the cultivator
    const c = cult as any
    if (c.cultivator_org_id) {
      const { data: m } = await service
        .from('org_memberships')
        .select('id')
        .eq('org_id', c.cultivator_org_id)
        .eq('user_id', userId!)
        .eq('verified', true)
        .maybeSingle()
      if (!m) return err('Only the cultivator can rate', 403)
    } else if (c.cultivator_company_id) {
      const { data: comp } = await service
        .from('hessian_companies')
        .select('id')
        .eq('id', c.cultivator_company_id)
        .eq('captain_id', userId!)
        .maybeSingle()
      if (!comp) return err('Only the cultivator can rate', 403)
    }

    await service
      .from('spy_cultivations')
      .update({ intel_quality_rating: body.rating })
      .eq('id', body.cultivation_id)

    return ok({ id: body.cultivation_id, rating: body.rating })
  }

  // ─── Send cultivation request ───────────────────────────────────────────────
  if (!body.target_user_id) return err('target_user_id is required')
  if (!body.offer_type || !['loyalty_points', 'hessian_special', 'social_acknowledgment'].includes(body.offer_type)) {
    return err('Invalid offer_type')
  }

  // Determine cultivator (org or Hessian company)
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  const { data: company } = await service
    .from('hessian_companies')
    .select('id')
    .eq('captain_id', userId!)
    .maybeSingle()

  if (!membership && !company) return err('You must be an org leader or Hessian Captain to cultivate assets', 403)

  // Check for existing pending cultivation to this user
  const { data: existing } = await service
    .from('spy_cultivations')
    .select('id, status')
    .eq('target_user_id', body.target_user_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return err('This person already has a pending cultivation request', 409)

  const { data, error } = await service
    .from('spy_cultivations')
    .insert({
      cultivator_type: membership ? 'org' : 'hessian_company',
      cultivator_org_id: membership ? (membership as any).org_id : null,
      cultivator_company_id: company ? (company as any).id : null,
      target_user_id: body.target_user_id,
      offer_type: body.offer_type,
      offer_detail: body.offer_detail ?? '',
      status: 'pending',
    })
    .select('id, status')
    .single()

  if (error) return err(error.message, 500)

  return ok({ ...data, message: 'Cultivation request sent.' }, 201)
}

/**
 * GET /api/turf-wars/spies/cultivate
 * Returns cultivations visible to the caller (as target or cultivator).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  // As target
  const { data: asTarget } = await service
    .from('spy_cultivations')
    .select(`
      id, offer_type, offer_detail, status, intel_quality_rating, created_at,
      cultivator_org_id, cultivator_company_id
    `)
    .eq('target_user_id', userId!)
    .order('created_at', { ascending: false })

  // As cultivator (org)
  const { data: orgMemberships } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)

  const orgIds = ((orgMemberships as any[]) ?? []).map(m => m.org_id)

  let asCultivator: any[] = []
  if (orgIds.length > 0) {
    const { data } = await service
      .from('spy_cultivations')
      .select('id, offer_type, status, intel_quality_rating, created_at, target_user_id')
      .in('cultivator_org_id', orgIds)
      .order('created_at', { ascending: false })
    asCultivator = (data as any[]) ?? []
  }

  // As cultivator (Hessian company)
  const { data: myCompany } = await service
    .from('hessian_companies')
    .select('id')
    .eq('captain_id', userId!)
    .maybeSingle()

  if (myCompany) {
    const { data: companyCults } = await service
      .from('spy_cultivations')
      .select('id, offer_type, status, intel_quality_rating, created_at, target_user_id')
      .eq('cultivator_company_id', (myCompany as any).id)
      .order('created_at', { ascending: false })
    asCultivator = [...asCultivator, ...((companyCults as any[]) ?? [])]
  }

  return ok({ asTarget: (asTarget as any[]) ?? [], asCultivator })
}
