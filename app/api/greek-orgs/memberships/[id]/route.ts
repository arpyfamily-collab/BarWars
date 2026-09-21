import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * PATCH /api/greek-orgs/memberships/[id]
 *
 * Org admin verifies or rejects a membership request.
 * Also used to promote/demote roles.
 *
 * Body: { action: 'verify' | 'reject' | 'promote' | 'demote' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { action: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.action) return err('action is required')
  if (!['verify', 'reject', 'promote', 'demote'].includes(body.action)) {
    return err('action must be "verify", "reject", "promote", or "demote"')
  }

  const service = createServiceClient()

  // Fetch the membership
  const { data: membership, error: fetchError } = await service
    .from('org_memberships')
    .select('id, org_id, user_id, role, verified')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchError) return err(fetchError.message, 500)
  if (!membership) return err('Membership not found', 404)

  // Verify caller is a verified admin of this org
  const { data: adminCheck } = await service
    .from('org_memberships')
    .select('id')
    .eq('org_id', (membership as any).org_id)
    .eq('user_id', userId!)
    .eq('role', 'admin')
    .eq('verified', true)
    .maybeSingle()

  if (!adminCheck) {
    return err('Only org admins can manage memberships', 403)
  }

  const mem = membership as any

  if (body.action === 'verify') {
    const { data, error } = await service
      .from('org_memberships')
      .update({
        verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('id, role, verified')
      .single()

    if (error) return err(error.message, 500)

    // Update org's verified_member_count
    const { data: countData } = await service
      .from('org_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', mem.org_id)
      .eq('verified', true)

    await service
      .from('greek_orgs')
      .update({ verified_member_count: (countData as any)?.length ?? 0 })
      .eq('id', mem.org_id)

    return ok(data)
  }

  if (body.action === 'reject') {
    // Delete the membership request
    const { error } = await service
      .from('org_memberships')
      .delete()
      .eq('id', params.id)

    if (error) return err(error.message, 500)
    return ok({ id: params.id, rejected: true })
  }

  if (body.action === 'promote') {
    const { data, error } = await service
      .from('org_memberships')
      .update({ role: 'admin' })
      .eq('id', params.id)
      .select('id, role')
      .single()

    if (error) return err(error.message, 500)
    return ok(data)
  }

  // demote
  const { data, error } = await service
    .from('org_memberships')
    .update({ role: 'member' })
    .eq('id', params.id)
    .select('id, role')
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}
