import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/hessians/contract
 *
 * Create or respond to a Hessian contract.
 *
 * Create (Greek org member): hires a Hessian Company for a claim event.
 *   Body: { company_id, claim_id, side: 'attacker' | 'defender' }
 *
 * Respond (Hessian Captain): accept or reject a pending contract.
 *   Body: { contract_id, action: 'accept' | 'reject' }
 *
 * Double Cross (Hessian Captain): secretly switch sides mid-event.
 *   Body: { contract_id, action: 'double_cross', rival_org_id }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Respond to contract (captain accepts/rejects/double crosses) ─────────────
  if (body.contract_id) {
    const { data: contract, error: fetchErr } = await service
      .from('hessian_contracts')
      .select('id, status, company_id, org_id, claim_id, side')
      .eq('id', body.contract_id)
      .maybeSingle()

    if (fetchErr) return err(fetchErr.message, 500)
    if (!contract) return err('Contract not found', 404)

    const c = contract as any

    // Verify caller is the captain of this company
    const { data: company } = await service
      .from('hessian_companies')
      .select('captain_id, name, betrayals, contracts_completed, reputation_score')
      .eq('id', c.company_id)
      .maybeSingle()

    if (!company || (company as any).captain_id !== userId) {
      return err('Only the Captain can respond to contracts', 403)
    }

    if (c.status !== 'pending') {
      return err(`Contract is already ${c.status}`, 409)
    }

    if (body.action === 'accept') {
      await service
        .from('hessian_contracts')
        .update({ status: 'accepted' })
        .eq('id', body.contract_id)
      return ok({ id: body.contract_id, status: 'accepted' })
    }

    if (body.action === 'reject') {
      await service
        .from('hessian_contracts')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', body.contract_id)
      return ok({ id: body.contract_id, status: 'rejected' })
    }

    if (body.action === 'double_cross') {
      if (!body.rival_org_id) return err('rival_org_id is required for a double cross')

      // Verify the rival org is the opposing side in this claim
      const { data: claim } = await service
        .from('turf_claims')
        .select('attacking_org_id, defending_org_id')
        .eq('id', c.claim_id)
        .maybeSingle()

      if (!claim) return err('Claim not found', 404)

      const claimAny = claim as any
      const opposingOrgId = c.side === 'attacker' ? claimAny.defending_org_id : claimAny.attacking_org_id

      if (body.rival_org_id !== opposingOrgId) {
        return err('Double cross target must be the opposing org in this claim', 422)
      }

      const now = new Date().toISOString()

      // Mark contract as betrayed
      await service
        .from('hessian_contracts')
        .update({
          status: 'betrayed',
          double_cross_org_id: body.rival_org_id,
          double_cross_executed_at: now,
          resolved_at: now,
        })
        .eq('id', body.contract_id)

      // Update company reputation: -10 for betrayal
      const compAny = company as any
      await service
        .from('hessian_companies')
        .update({
          betrayals: compAny.betrayals + 1,
          reputation_score: compAny.reputation_score - 10,
        })
        .eq('id', c.company_id)

      // Fetch names for the public announcement
      const { data: orgData } = await service
        .from('greek_orgs')
        .select('name')
        .eq('id', c.org_id)
        .single()

      const { data: rivalData } = await service
        .from('greek_orgs')
        .select('name')
        .eq('id', body.rival_org_id)
        .single()

      const { data: barData } = await service
        .from('turf_claims')
        .select('bar:venues(name)')
        .eq('id', c.claim_id)
        .single()

      // Public event — the Double Cross announcement
      await service.from('turf_events').insert({
        claim_id: c.claim_id,
        event_type: 'war_declared',
        org_id: c.org_id,
        bar_id: (barData as any)?.bar?.id ?? null,
        headline: `DOUBLE CROSS — ${compAny.name} betrayed ${orgData?.name ?? 'their employer'}`,
        body: `${compAny.name} was contracted by ${orgData?.name ?? 'an org'} but checked in for ${rivalData?.name ?? 'the rival'} instead. ${compAny.name}'s reputation drops. Let the record show: mercenaries don't owe loyalty.`,
        deep_link: `/turf-wars/${c.claim_id}`,
        visible_to: 'public',
      })

      return ok({
        id: body.contract_id,
        status: 'betrayed',
        double_cross_org_id: body.rival_org_id,
        reputation_change: -10,
      })
    }

    return err('Invalid action for contract response')
  }

  // ─── Create contract (Greek org member hires Hessian Company) ────────────────
  if (!body.company_id) return err('company_id is required')
  if (!body.claim_id) return err('claim_id is required')
  if (!body.side || !['attacker', 'defender'].includes(body.side)) {
    return err('side must be "attacker" or "defender"')
  }

  // Verify caller is a verified org member
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified org member to hire Hessians', 403)

  // Verify the claim exists and the org is involved
  const { data: claim } = await service
    .from('turf_claims')
    .select('attacking_org_id, defending_org_id, status')
    .eq('id', body.claim_id)
    .maybeSingle()

  if (!claim) return err('Claim not found', 404)

  const claimAny = claim as any
  const orgId = (membership as any).org_id

  if (body.side === 'attacker' && claimAny.attacking_org_id !== orgId) {
    return err('Your org is not the attacker in this claim', 403)
  }
  if (body.side === 'defender' && claimAny.defending_org_id !== orgId) {
    return err('Your org is not the defender in this claim', 403)
  }

  // Check if this company already has a contract for this claim
  const { data: existingContract } = await service
    .from('hessian_contracts')
    .select('id, status')
    .eq('company_id', body.company_id)
    .eq('claim_id', body.claim_id)
    .neq('status', 'rejected')
    .maybeSingle()

  if (existingContract) return err('This company already has a contract for this event', 409)

  // Fetch company name for the event
  const { data: company } = await service
    .from('hessian_companies')
    .select('name, betrayals, contracts_completed')
    .eq('id', body.company_id)
    .maybeSingle()

  if (!company) return err('Hessian Company not found', 404)

  // Create the contract
  const { data: contract, error: insertErr } = await service
    .from('hessian_contracts')
    .insert({
      org_id: orgId,
      company_id: body.company_id,
      claim_id: body.claim_id,
      side: body.side,
      status: 'pending',
      agreed_weight: 0.75,
    })
    .select('id, status, side, agreed_weight')
    .single()

  if (insertErr) return err(insertErr.message, 500)

  return ok({
    ...contract,
    company_name: (company as any).name,
    warning: (company as any).betrayals > 0
      ? `WARNING: This company has ${(company as any).betrayals} betrayal(s) on record.`
      : null,
  }, 201)
}

/**
 * GET /api/turf-wars/hessians/contract?claim_id=xxx
 * List contracts for a claim (public — reputation transparency).
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const claimId = searchParams.get('claim_id')
  const companyId = searchParams.get('company_id')
  const orgId = searchParams.get('org_id')

  const service = createServiceClient()

  let query = service
    .from('hessian_contracts')
    .select(`
      id, status, side, agreed_weight, created_at, resolved_at,
      double_cross_org_id, double_cross_executed_at,
      org:greek_orgs(name),
      company:hessian_companies(name, reputation_score, betrayals)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (claimId) query = query.eq('claim_id', claimId)
  if (companyId) query = query.eq('company_id', companyId)
  if (orgId) query = query.eq('org_id', orgId)

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}
