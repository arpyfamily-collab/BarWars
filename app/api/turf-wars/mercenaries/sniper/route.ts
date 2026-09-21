import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/mercenaries/sniper
 * - Returns sniper contracts visible to the caller (as sniper, target, or hirer)
 * - ?targets=true: lists users who are sniper-eligible (for hirers to choose targets)
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const wantTargets = searchParams.get('targets') === 'true'

  const service = createServiceClient()

  if (wantTargets) {
    // List sniper-eligible mercenaries (no identity — just IDs and stats)
    const { data, error } = await service
      .from('mercenaries')
      .select('id, contracts_completed, sniper_eligible')
      .eq('sniper_eligible', true)
      .eq('is_active', true)
      .limit(20)

    if (error) return err(error.message, 500)
    return ok((data as any[])?.map(m => ({
      id: m.id,
      label: `Target #${m.id.slice(0, 6)}`,
      contracts_completed: m.contracts_completed,
    })) ?? [])
  }

  // Get caller's sniper contracts (as sniper, target, or hirer)
  const { data: myMerc } = await service
    .from('mercenaries')
    .select('id, is_sniper')
    .eq('user_id', userId!)
    .maybeSingle()

  let asSniper: any[] = []
  if (myMerc) {
    const { data } = await service
      .from('sniper_contracts')
      .select(`
        id, status, tactics_used, created_at, resolved_at,
        org:greek_orgs(name),
        company:hessian_companies(name)
      `)
      .eq('sniper_id', (myMerc as any).id)
      .order('created_at', { ascending: false })
      .limit(20)
    asSniper = (data as any[]) ?? []
  }

  const { data: asTarget } = await service
    .from('sniper_contracts')
    .select(`
      id, status, created_at, resolved_at,
      org:greek_orgs(name),
      company:hessian_companies(name)
    `)
    .eq('target_user_id', userId!)
    .order('created_at', { ascending: false })
    .limit(10)

  return ok({ asSniper, asTarget: (asTarget as any[]) ?? [], isSniper: (myMerc as any)?.is_sniper ?? false })
}

/**
 * POST /api/turf-wars/mercenaries/sniper
 *
 * Hire a sniper (org or Hessian captain):
 *   { sniper_id, target_user_id, claim_id? }
 *   Target must have sniper_eligible = true.
 *
 * Update sniper contract (as the sniper):
 *   { contract_id, action: 'activate' | 'succeed' | 'fail', tactics? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Update sniper contract ─────────────────────────────────────────────────
  if (body.contract_id && body.action) {
    const { data: contract } = await service
      .from('sniper_contracts')
      .select('id, status, sniper_id')
      .eq('id', body.contract_id)
      .maybeSingle()

    if (!contract) return err('Contract not found', 404)
    const c = contract as any

    // Verify caller is the sniper
    const { data: merc } = await service
      .from('mercenaries')
      .select('id, war_bonds, contracts_completed')
      .eq('user_id', userId!)
      .maybeSingle()
    if (!merc || (merc as any).id !== c.sniper_id) return err('Only the sniper can update this', 403)

    const now = new Date().toISOString()
    const m = merc as any

    if (body.action === 'activate') {
      if (c.status !== 'pending') return err('Contract must be pending', 409)
      await service
        .from('sniper_contracts')
        .update({ status: 'active', tactics_used: body.tactics ?? '' })
        .eq('id', body.contract_id)
      return ok({ id: body.contract_id, status: 'active' })
    }

    if (body.action === 'succeed') {
      await service
        .from('sniper_contracts')
        .update({ status: 'successful', tactics_used: body.tactics ?? c.tactics_used, resolved_at: now })
        .eq('id', body.contract_id)

      // Award war bonds
      const reward = 20
      await service
        .from('mercenaries')
        .update({ war_bonds: m.war_bonds + reward, contracts_completed: m.contracts_completed + 1 })
        .eq('id', m.id)

      await service
        .from('war_bond_ledger')
        .insert({ user_id: userId!, amount: reward, reason: 'sniper_success', reference_id: c.id })

      return ok({ id: body.contract_id, status: 'successful', war_bonds_earned: reward })
    }

    if (body.action === 'fail') {
      await service
        .from('sniper_contracts')
        .update({ status: 'failed', resolved_at: now })
        .eq('id', body.contract_id)
      return ok({ id: body.contract_id, status: 'failed' })
    }

    return err('Invalid action')
  }

  // ─── Hire a sniper ──────────────────────────────────────────────────────────
  if (!body.sniper_id || !body.target_user_id) return err('sniper_id and target_user_id are required')

  // Verify target has sniper_eligible = true
  const { data: target } = await service
    .from('mercenaries')
    .select('id, sniper_eligible, user_id')
    .eq('id', body.target_user_id)
    .maybeSingle()

  // target_user_id might be a mercenary ID or a user ID
  // The spec says snipers target "a specific named user" who has opted into Sniper Eligible
  // So target_user_id is an auth.users ID. Check if they have a mercenary profile with sniper_eligible
  const { data: targetMerc } = await service
    .from('mercenaries')
    .select('id, sniper_eligible')
    .eq('user_id', body.target_user_id)
    .eq('sniper_eligible', true)
    .maybeSingle()

  if (!targetMerc) return err('Target has not opted into Sniper Eligible. You can only snipe consenting players.', 403)

  // Verify sniper is actually a sniper
  const { data: sniper } = await service
    .from('mercenaries')
    .select('id, is_sniper')
    .eq('id', body.sniper_id)
    .maybeSingle()

  if (!sniper || !(sniper as any).is_sniper) return err('That mercenary is not a sniper', 422)

  // Determine hirer
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

  if (!membership && !company) return err('You must be an org leader or Hessian Captain to hire a sniper', 403)

  const { data, error } = await service
    .from('sniper_contracts')
    .insert({
      sniper_id: body.sniper_id,
      target_user_id: body.target_user_id,
      hirer_org_id: membership ? (membership as any).org_id : null,
      hirer_company_id: company ? (company as any).id : null,
      claim_id: body.claim_id ?? null,
      status: 'pending',
    })
    .select('id, status')
    .single()

  if (error) return err(error.message, 500)

  return ok({ ...data, message: 'Sniper contract issued. Target has consented to being hunted.' }, 201)
}
