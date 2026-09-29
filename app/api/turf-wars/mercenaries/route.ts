import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/mercenaries
 * - No params: returns the Mercenary Exchange (anonymous listings with execution rates)
 * - ?mine=true: returns the caller's mercenary profile + contracts
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  const service = createServiceClient()

  // Contracts this player issued as a hirer (item 14: the hirer confirms completion)
  if (searchParams.get('issued') === 'true') {
    const { data: issued } = await service
      .from('mercenary_contracts')
      .select(`id, role, status, war_bond_reward, created_at, resolved_at, claim_id, payment:bracelet_drops!mercenary_contracts_payment_bracelet_id_fkey(offer_type, offer_value, valid_night, valid_nights, venue:venues!bracelet_drops_venue_id_fkey(name))`)
      .eq('hired_by', userId!)
      .order('created_at', { ascending: false })
      .limit(20)
    return ok({ contracts: (issued as any[]) ?? [] })
  }

  if (mine) {
    const { data: profile } = await service
      .from('mercenaries')
      .select('*')
      .eq('user_id', userId!)
      .maybeSingle()

    if (!profile) return ok(null)

    const { data: contracts } = await service
      .from('mercenary_contracts')
      .select(`
        id, role, status, war_bond_reward, created_at, resolved_at,
        distraction_decoy_bar_id,
        org:greek_orgs(name),
        company:hessian_companies(name),
        payment:bracelet_drops!mercenary_contracts_payment_bracelet_id_fkey(offer_type, offer_value, valid_night, valid_nights, venue:venues!bracelet_drops_venue_id_fkey(name))
      `)
      .eq('mercenary_id', (profile as any).id)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: bonds } = await service
      .from('war_bond_ledger')
      .select('id, amount, reason, created_at')
      .eq('user_id', userId!)
      .order('created_at', { ascending: false })
      .limit(20)

    return ok({ profile, contracts: (contracts as any[]) ?? [], bonds: (bonds as any[]) ?? [] })
  }

  // Exchange listing — strip identity for anonymous mercenaries
  const { data, error } = await service
    .from('mercenaries')
    .select('id, is_anonymous, contracts_completed, contracts_failed, is_sniper, sniper_eligible')
    .eq('is_active', true)
    .order('contracts_completed', { ascending: false })
    .limit(30)

  if (error) return err(error.message, 500)

  const listings = ((data as any[]) ?? []).map(m => {
    const total = m.contracts_completed + m.contracts_failed
    const rate = total > 0 ? Math.round((m.contracts_completed / total) * 100) : 0
    return {
      id: m.id,
      display_name: m.is_anonymous ? `Mercenary #${m.id.slice(0, 6)}` : 'Mercenary',
      contracts_completed: m.contracts_completed,
      execution_rate: rate,
      is_sniper: m.is_sniper,
      sniper_eligible: m.sniper_eligible,
    }
  })

  return ok(listings)
}

/**
 * POST /api/turf-wars/mercenaries
 *
 * Register as a mercenary:
 *   { action: 'register', is_anonymous?, is_sniper?, sniper_eligible? }
 *
 * Toggle sniper eligibility:
 *   { action: 'toggle_sniper_eligible' }
 *
 * Respond to a contract:
 *   { action: 'respond', contract_id, response: 'accept' | 'reject' }
 *
 * Complete a contract:
 *   { action: 'complete', contract_id, success: boolean }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Register ───────────────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { data: existing } = await service
      .from('mercenaries')
      .select('id, is_active')
      .eq('user_id', userId!)
      .maybeSingle()

    if (existing && (existing as any).is_active) return err('You are already registered as a mercenary', 409)

    // Faction rules live in the database (To-Do item 10): Hessians can be solo mercenaries,
    // Greek members can't, and re-registering waits out the 7-day cooldown.
    if (existing) {
      const { data, error } = await service
        .from('mercenaries')
        .update({ is_active: true })
        .eq('id', (existing as any).id)
        .select('id, is_anonymous, is_sniper, sniper_eligible')
        .single()
      if (error) { const e = factionError(error.message); return err(e.message, e.status) }
      return ok({ ...data, message: 'Welcome back, Mercenary.' })
    }

    const { data, error } = await service
      .from('mercenaries')
      .insert({
        user_id: userId!,
        is_active: true,
        is_anonymous: body.is_anonymous ?? true,
        is_sniper: body.is_sniper ?? false,
        sniper_eligible: body.sniper_eligible ?? false,
      })
      .select('id, is_anonymous, is_sniper, sniper_eligible')
      .single()

    if (error) { const e = factionError(error.message); return err(e.message, e.status) }

    return ok({ ...data, message: 'You are now a Mercenary. No loyalty. No company. Just the job.' }, 201)
  }

  // ─── Toggle sniper eligible ─────────────────────────────────────────────────
  if (body.action === 'toggle_sniper_eligible') {
    const { data: merc } = await service
      .from('mercenaries')
      .select('id, sniper_eligible')
      .eq('user_id', userId!)
      .maybeSingle()

    if (!merc) return err('Register as a mercenary first', 404)

    const newValue = !(merc as any).sniper_eligible
    await service
      .from('mercenaries')
      .update({ sniper_eligible: newValue })
      .eq('id', (merc as any).id)

    return ok({ sniper_eligible: newValue, message: newValue ? 'You are now Sniper Eligible. Come at me.' : 'Sniper Eligible disabled.' })
  }

  // ─── Respond to contract ────────────────────────────────────────────────────
  if (body.action === 'respond' && body.contract_id) {
    const { data: contract } = await service
      .from('mercenary_contracts')
      .select('id, status, mercenary_id')
      .eq('id', body.contract_id)
      .maybeSingle()

    if (!contract) return err('Contract not found', 404)
    const c = contract as any
    if (c.status !== 'pending') return err(`Contract already ${c.status}`, 409)

    // Verify caller is the mercenary
    const { data: merc } = await service
      .from('mercenaries')
      .select('id')
      .eq('user_id', userId!)
      .maybeSingle()
    if (!merc || (merc as any).id !== c.mercenary_id) return err('Only the mercenary can respond', 403)

    if (body.response === 'accept') {
      const { error: accErr } = await service
        .from('mercenary_contracts')
        .update({ status: 'accepted' })
        .eq('id', body.contract_id)
      if (accErr) {
        if (accErr.message.includes('PAYMENT_RECIPIENT_18')) return err('You must be 18 or older to be paid in a bracelet.', 403)
        if (accErr.message.includes('PAYMENT_EXPIRED')) return err("The bracelet offered as payment has expired. Ask the hirer to re-offer the job.", 409)
        if (accErr.message.includes('EDU_REQUIRED')) return err('Verify your Ole Miss email to take this contract.', 403)
        return err('Could not accept the contract.', 500)
      }
      return ok({ id: body.contract_id, status: 'accepted' })
    }
    if (body.response === 'reject') {
      await service
        .from('mercenary_contracts')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', body.contract_id)
      return ok({ id: body.contract_id, status: 'rejected' })
    }
    return err('Invalid response')
  }

  // ─── Complete contract ──────────────────────────────────────────────────────
  // Item 14 (Sep 29): the hirer confirms the job, never the mercenary. Before this, a mercenary marked
  // their own contract successful and paid themselves; with bracelet payments that would hand over the
  // bracelet for nothing. The mercenary can only withdraw (the contract fails, nothing is paid).
  if (body.action === 'complete' && body.contract_id) {
    const { data: contract } = await service
      .from('mercenary_contracts')
      .select('id, status, mercenary_id, role, war_bond_reward, hirer_org_id, hirer_company_id, hired_by')
      .eq('id', body.contract_id)
      .maybeSingle()
    if (!contract) return err('Contract not found', 404)
    const c = contract as any
    if (c.status !== 'accepted') return err('Contract must be accepted first', 409)

    const { data: merc } = await service.from('mercenaries')
      .select('id, user_id, contracts_completed, contracts_failed, war_bonds').eq('id', c.mercenary_id).maybeSingle()
    const m = merc as any
    const isMercenary = m?.user_id === userId
    let isHirer = c.hired_by === userId
    if (!isHirer && c.hirer_org_id) {
      const { data: lead } = await service.rpc('is_org_leader', { p_org: c.hirer_org_id, p_user: userId })
      isHirer = !!lead
    }
    if (!isHirer && c.hirer_company_id) {
      const { data: comp } = await service.from('hessian_companies').select('captain_id').eq('id', c.hirer_company_id).maybeSingle()
      isHirer = (comp as any)?.captain_id === userId
    }
    const success = !!body.success
    if (!isHirer && !(isMercenary && !success)) {
      return err(isMercenary ? 'Your hirer confirms the job is done. You can only withdraw.' : 'Only the hirer can complete this contract.', 403)
    }

    const now = new Date().toISOString()
    const { error: upErr } = await service.from('mercenary_contracts')
      .update({ status: success ? 'completed' : 'failed', resolved_at: now }).eq('id', body.contract_id)
    if (upErr) return err('Could not update the contract.', 500)

    const newBonds = success ? m.war_bonds + c.war_bond_reward : m.war_bonds
    await service.from('mercenaries').update({
      contracts_completed: success ? m.contracts_completed + 1 : m.contracts_completed,
      contracts_failed: success ? m.contracts_failed : m.contracts_failed + 1,
      war_bonds: newBonds,
    }).eq('id', m.id)
    if (success) {
      await service.from('war_bond_ledger').insert({
        user_id: m.user_id, amount: c.war_bond_reward,
        reason: c.role === 'distraction' ? 'distraction_success' : 'contract_completed', reference_id: c.id,
      })
    }
    return ok({ id: body.contract_id, status: success ? 'completed' : 'failed', war_bonds_earned: success ? c.war_bond_reward : 0 })
  }

  // ─── Hire a mercenary (org or Hessian captain) ──────────────────────────────
  if (!body.action && body.mercenary_id) {
    if (!body.role || !['headcount_filler', 'intel_extraction', 'disinformation', 'distraction'].includes(body.role)) {
      return err('Invalid role')
    }

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

    let isLeader = false
    if (membership) {
      const { data: lead } = await service.rpc('is_org_leader', { p_org: (membership as any).org_id, p_user: userId })
      isLeader = !!lead
    }
    // Hiring spends the org's resources: leaders only (any member could hire before, Sep 29)
    if (!isLeader && !company) return err('You must be an org leader or Hessian Captain to hire mercenaries', 403)

    // Validate distraction contract needs a decoy bar
    if (body.role === 'distraction' && !body.distraction_decoy_bar_id) {
      return err('Distraction contracts require a decoy bar', 422)
    }

    const reward = body.role === 'distraction' ? 15 : body.role === 'intel_extraction' ? 10 : 5

    const { data, error } = await service
      .from('mercenary_contracts')
      .insert({
        mercenary_id: body.mercenary_id,
        hirer_type: membership ? 'org' : 'hessian_company',
        hirer_org_id: membership ? (membership as any).org_id : null,
        hirer_company_id: company ? (company as any).id : null,
        claim_id: body.claim_id ?? null,
        role: body.role,
        status: 'pending',
        war_bond_reward: reward,
        distraction_decoy_bar_id: body.distraction_decoy_bar_id ?? null,
        hired_by: userId!,
        payment_bracelet_id: body.payment_bracelet_id || null,
      })
      .select('id, status, role, war_bond_reward')
      .single()

    if (error) {
      const PAY: Record<string, string> = {
        PAYMENT_NOT_YOURS: "That bracelet isn't yours.", PAYMENT_NO_DRINKS: "Drink-offer bracelets can't be used as payment.",
        PAYMENT_ALREADY_TRADED: 'That bracelet already changed hands once, so it can\'t be paid on.', PAYMENT_USED: 'That bracelet was already used.',
        PAYMENT_IN_ESCROW: "That bracelet is already offered on another contract.", PAYMENT_EXPIRED: 'That bracelet has expired.',
      }
      for (const [k, m] of Object.entries(PAY)) if (error.message.includes(k)) return err(m, 409)
      return err('Could not offer the contract.', 500)
    }

    return ok({ ...data, message: `Contract offered to mercenary. Reward: ${reward} War Bonds${body.payment_bracelet_id ? ' plus the bracelet (held until the job is done)' : ''}.` }, 201)
  }

  return err('Invalid action')
}
