import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

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
    return err(insertErr.message, 500)
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
    await service
      .from('hessian_members')
      .update({ verified: true })
      .eq('id', body.member_id)

    // Increment company member count
    const { data: comp } = await service
      .from('hessian_companies')
      .select('member_count')
      .eq('id', (member as any).company_id)
      .single()

    await service
      .from('hessian_companies')
      .update({ member_count: (comp as any).member_count + 1 })
      .eq('id', (member as any).company_id)

    return ok({ id: body.member_id, verified: true })
  } else {
    // Reject = delete the pending membership
    await service
      .from('hessian_members')
      .delete()
      .eq('id', body.member_id)

    return ok({ id: body.member_id, deleted: true })
  }
}
