import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/hessians — list all Hessian companies (leaderboard)
 * Optional ?company_id=xxx for single company detail
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  const service = createServiceClient()

  if (companyId) {
    const { data, error } = await service
      .from('hessian_companies')
      .select(`
        id, name, member_count, reputation_score, betrayals, contracts_completed,
        ambushes_won, occupied_bar_id, occupation_expires_at, created_at
      `)
      .eq('id', companyId)
      .maybeSingle()
    if (error) return err(error.message, 500)
    if (!data) return err('Company not found', 404)
    return ok(data)
  }

  const { data, error } = await service
    .from('hessian_companies')
    .select('id, name, member_count, reputation_score, betrayals, contracts_completed, ambushes_won, created_at')
    .order('reputation_score', { ascending: false })
    .limit(50)

  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/turf-wars/hessians — register a new Hessian Company
 * Body: { name: string }
 * Caller becomes the Captain. Must not already be in a Hessian Company.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { name: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.name) return err('Company name is required')
  if (body.name.length < 3) return err('Company name must be at least 3 characters')

  const service = createServiceClient()

  // Check if user is already in a Hessian Company
  const { data: existingMember } = await service
    .from('hessian_members')
    .select('id')
    .eq('user_id', userId!)
    .maybeSingle()

  if (existingMember) return err('You are already a member of a Hessian Company', 409)

  // Check if user is a verified Greek org member (Hessians must be non-Greek)
  const { data: orgMember } = await service
    .from('org_memberships')
    .select('id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (orgMember) return err('Verified Greek org members cannot form Hessian Companies. Hessians are independent.', 403)

  // Check name uniqueness
  const { data: existingName } = await service
    .from('hessian_companies')
    .select('id')
    .eq('name', body.name)
    .maybeSingle()

  if (existingName) return err('A company with this name already exists', 409)

  // Create the company
  const { data: company, error: insertErr } = await service
    .from('hessian_companies')
    .insert({
      name: body.name,
      captain_id: userId,
      member_count: 1,
    })
    .select('id, name, created_at')
    .single()

  if (insertErr) return err(insertErr.message, 500)

  // Add the captain as a verified member
  await service
    .from('hessian_members')
    .insert({
      company_id: (company as any).id,
      user_id: userId!,
      role: 'captain',
      verified: true,
    })

  return ok(company, 201)
}
