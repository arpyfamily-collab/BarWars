import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/recruit
 * Returns the caller's pending and resolved spy recruitment approaches.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data, error } = await service
    .from('spy_recruitments')
    .select('id, recruiter_type, status, is_platform_test, loyalty_flag, created_at, resolved_at')
    .eq('target_user_id', userId!)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)

  const pending = (data as any[])?.filter(r => r.status === 'pending') ?? []
  const resolved = (data as any[])?.filter(r => r.status !== 'pending') ?? []

  return ok({ pending, resolved })
}

/**
 * POST /api/turf-wars/spies/recruit
 *
 * Respond to a recruitment approach:
 *   { recruitment_id, action: 'accept' | 'delete' | 'report' }
 *
 * Create a recruitment (rival org or Hessian captain approaches someone):
 *   { target_user_id, recruiter_type: 'rival_org' | 'hessian_captain' }
 *
 * Platform loyalty test (service role only — called from edge function):
 *   { target_user_id, is_platform_test: true }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Respond to existing recruitment ────────────────────────────────────────
  if (body.recruitment_id) {
    const { data: recruitment, error: fetchErr } = await service
      .from('spy_recruitments')
      .select('id, status, is_platform_test, recruiter_type, recruiter_org_id, recruiter_company_id')
      .eq('id', body.recruitment_id)
      .eq('target_user_id', userId!)
      .maybeSingle()

    if (fetchErr) return err(fetchErr.message, 500)
    if (!recruitment) return err('Recruitment not found', 404)

    const r = recruitment as any
    if (r.status !== 'pending') return err(`Already ${r.status}`, 409)

    const now = new Date().toISOString()

    if (body.action === 'accept') {
      // Update recruitment status
      await service
        .from('spy_recruitments')
        .update({ status: 'accepted', resolved_at: now })
        .eq('id', body.recruitment_id)

      // If this is a platform loyalty test, flag as susceptible
      if (r.is_platform_test) {
        await service
          .from('spy_recruitments')
          .update({ loyalty_flag: 'susceptible' })
          .eq('id', body.recruitment_id)

        // Send anonymous alert to org leadership (if user is in an org)
        const { data: membership } = await service
          .from('org_memberships')
          .select('org_id')
          .eq('user_id', userId!)
          .eq('verified', true)
          .maybeSingle()

        if (membership) {
          // We can't identify the specific member, but we log the alert as a turf event
          await service.from('turf_events').insert({
            event_type: 'war_declared',
            org_id: (membership as any).org_id,
            headline: 'LOYALTY ALERT — A member of your organization accepted an approach',
            body: 'Identity not disclosed. Consider activating a Mole Hunt if you suspect infiltration.',
            deep_link: '/turf-wars/spies',
            visible_to: 'orgs_only',
          })
        }

        return ok({ id: body.recruitment_id, status: 'accepted', loyalty_flag: 'susceptible' })
      }

      // Real recruitment — create spy asset
      const spyType = r.recruiter_type === 'hessian_captain' ? 'infiltrator' : 'infiltrator'
      const handlerType = r.recruiter_type === 'hessian_captain' ? 'hessian_company' : 'org'

      await service
        .from('spy_assets')
        .insert({
          asset_user_id: userId!,
          handler_type: handlerType,
          handler_org_id: r.recruiter_org_id,
          handler_company_id: r.recruiter_company_id,
          spy_type: spyType,
          is_active: true,
        })

      return ok({ id: body.recruitment_id, status: 'accepted', message: 'You are now an active spy asset. Intel reports expire after 24 hours.' })
    }

    if (body.action === 'delete') {
      await service
        .from('spy_recruitments')
        .update({ status: 'deleted', resolved_at: now })
        .eq('id', body.recruitment_id)

      // If loyalty test and user deleted it without reporting, that's neutral
      return ok({ id: body.recruitment_id, status: 'deleted' })
    }

    if (body.action === 'report') {
      await service
        .from('spy_recruitments')
        .update({ status: 'reported', resolved_at: now })
        .eq('id', body.recruitment_id)

      // If loyalty test and user reported it, flag as high_loyalty
      if (r.is_platform_test) {
        await service
          .from('spy_recruitments')
          .update({ loyalty_flag: 'high_loyalty' })
          .eq('id', body.recruitment_id)

        // Award high loyalty badge
        await service
          .from('spy_badges')
          .insert({
            user_id: userId!,
            badge_type: 'high_loyalty',
            detail: 'Reported a recruitment approach to leadership',
          })

        // Notify org leadership
        const { data: membership } = await service
          .from('org_memberships')
          .select('org_id')
          .eq('user_id', userId!)
          .eq('verified', true)
          .maybeSingle()

        if (membership) {
          await service.from('turf_events').insert({
            event_type: 'war_declared',
            org_id: (membership as any).org_id,
            headline: 'LOYALTY CONFIRMED — A member reported a spy approach',
            body: 'A member of your organization demonstrated high loyalty by reporting a recruitment attempt. Identity not disclosed.',
            deep_link: '/turf-wars/spies',
            visible_to: 'orgs_only',
          })
        }

        return ok({ id: body.recruitment_id, status: 'reported', loyalty_flag: 'high_loyalty' })
      }

      return ok({ id: body.recruitment_id, status: 'reported' })
    }

    return err('Invalid action')
  }

  // ─── Create recruitment (rival org or Hessian captain) ──────────────────────
  if (!body.target_user_id) return err('target_user_id is required')
  if (body.target_user_id === userId) return err('Cannot recruit yourself', 422)

  if (!body.recruiter_type || !['rival_org', 'hessian_captain'].includes(body.recruiter_type)) {
    return err('recruiter_type must be rival_org or hessian_captain')
  }

  // Determine recruiter org or company
  let orgId: string | null = null
  let companyId: string | null = null

  if (body.recruiter_type === 'rival_org') {
    const { data: membership } = await service
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', userId!)
      .eq('verified', true)
      .maybeSingle()
    if (!membership) return err('You must be a verified org member to send approaches', 403)
    orgId = (membership as any).org_id
  } else {
    const { data: company } = await service
      .from('hessian_companies')
      .select('id')
      .eq('captain_id', userId!)
      .maybeSingle()
    if (!company) return err('Only Hessian Captains can send approaches', 403)
    companyId = (company as any).id
  }

  // Check for existing pending recruitment to this user
  const { data: existing } = await service
    .from('spy_recruitments')
    .select('id, status')
    .eq('target_user_id', body.target_user_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return err('This user already has a pending approach', 409)

  const { data, error } = await service
    .from('spy_recruitments')
    .insert({
      target_user_id: body.target_user_id,
      recruiter_type: body.recruiter_type,
      recruiter_org_id: orgId,
      recruiter_company_id: companyId,
      status: 'pending',
      is_platform_test: false,
    })
    .select('id, status')
    .single()

  if (error) return err(error.message, 500)

  return ok({ ...data, message: 'Approach sent. The target will receive a sealed notification.' }, 201)
}
