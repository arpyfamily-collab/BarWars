import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/hessians/join
 * Join a Hessian Company (creates a pending membership for captain approval).
 * Body: { company_id: string }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { company_id: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.company_id) return err('company_id is required')

  const service = createServiceClient()

  // Check if already in any company
  const { data: existing } = await service
    .from('hessian_members')
    .select('id, company_id')
    .eq('user_id', userId!)
    .maybeSingle()

  if (existing) return err('You are already a member of a Hessian Company', 409)

  // Check if verified Greek org member
  const { data: orgMember } = await service
    .from('org_memberships')
    .select('id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (orgMember) return err('Verified Greek org members cannot join Hessian Companies', 403)

  // Insert membership as pending (captain must verify)
  const { data: membership, error: insertErr } = await service
    .from('hessian_members')
    .insert({
      company_id: body.company_id,
      user_id: userId!,
      role: 'member',
      verified: false,
    })
    .select('id, company_id, verified')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') return err('You have already requested to join this company', 409)
    const e = factionError(insertErr.message)
    return err(e.message, e.status)
  }

  return ok({ ...membership, message: 'Join request submitted. The Captain must verify you.' }, 201)
}

/**
 * PATCH /api/turf-wars/hessians/join
 * Captain approves/verifies a pending member.
 * Body: { member_id: string, action: 'approve' | 'reject' }
 */
export async function PATCH(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { member_id: string; action: 'approve' | 'reject' }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.member_id) return err('member_id is required')
  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return err('action must be "approve" or "reject"')
  }

  const service = createServiceClient()

  // Fetch the member record
  const { data: member, error: memberErr } = await service
    .from('hessian_members')
    .select('id, company_id, user_id, verified')
    .eq('id', body.member_id)
    .maybeSingle()

  if (memberErr) return err(memberErr.message, 500)
  if (!member) return err('Member not found', 404)

  // Verify the caller is the captain of this company
  const { data: company } = await service
    .from('hessian_companies')
    .select('captain_id')
    .eq('id', (member as any).company_id)
    .maybeSingle()

  if (!company || (company as any).captain_id !== userId) {
    return err('Only the Captain can approve members', 403)
  }

  if (body.action === 'approve') {
    if ((member as any).verified) return err('Already a member', 409)
    const { error: upErr } = await service
      .from('hessian_members')
      .update({ verified: true })
      .eq('id', body.member_id)
    if (upErr) { const e = factionError(upErr.message); return err(e.message, e.status) }

    // Keep the member count exact (the old +1 could drift)
    await service.rpc('recount_unit', { p_type: 'company', p_id: (member as any).company_id })

    return ok({ id: body.member_id, verified: true })
  } else {
    // Reject = delete the pending membership (verified members are removed from Your Factions instead)
    if ((member as any).verified) return err('Use Remove to take a member out of the company', 409)
    await service
      .from('hessian_members')
      .delete()
      .eq('id', body.member_id)

    return ok({ id: body.member_id, deleted: true })
  }
}
