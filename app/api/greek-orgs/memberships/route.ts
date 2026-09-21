import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * POST /api/greek-orgs/memberships — request to join an org
 * Creates an unverified membership. Org admin must verify.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { org_id: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.org_id) return err('org_id is required')

  const service = createServiceClient()

  // Check if org exists
  const { data: org } = await service
    .from('greek_orgs')
    .select('id, name')
    .eq('id', body.org_id)
    .maybeSingle()

  if (!org) return err('Org not found', 404)

  // Check if already a member
  const { data: existing } = await service
    .from('org_memberships')
    .select('id, verified')
    .eq('org_id', body.org_id)
    .eq('user_id', userId!)
    .maybeSingle()

  if (existing) {
    if ((existing as any).verified) {
      return err('You are already a verified member of this org', 409)
    }
    return err('You already have a pending membership request for this org', 409)
  }

  const { data: membership, error } = await service
    .from('org_memberships')
    .insert({
      org_id: body.org_id,
      user_id: userId,
      role: 'member',
      verified: false,
    })
    .select('id, role, verified')
    .single()

  if (error) return err(error.message, 500)
  return ok(membership, 201)
}

/**
 * GET /api/greek-orgs/memberships — list the caller's memberships
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data, error } = await service
    .from('org_memberships')
    .select(`
      id, org_id, role, verified, created_at,
      org:greek_orgs(name, org_type, chapter, home_turf_bar_id, turf_streak_weeks)
    `)
    .eq('user_id', userId!)

  if (error) return err(error.message, 500)
  return ok(data)
}
