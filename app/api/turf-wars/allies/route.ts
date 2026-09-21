import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/allies/signup
 *
 * Sign up as an ally from an invite link. Creates a lightweight ally record
 * tied to the inviting org and (optionally) a specific claim event.
 *
 * Body: {
 *   invite_token: string,
 *   name: string,
 *   email: string,
 *   university?: string,
 *   graduation_year?: number,
 *   greek_status?: 'member' | 'rush' | 'unaffiliated',
 *   national_brother?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: {
    invite_token: string
    name: string
    email: string
    university?: string
    graduation_year?: number
    greek_status?: 'member' | 'rush' | 'unaffiliated'
    national_brother?: boolean
  }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.invite_token) return err('invite_token is required')
  if (!body.name) return err('name is required')
  if (!body.email) return err('email is required')

  const service = createServiceClient()

  // Look up the invite
  const { data: invite, error: inviteErr } = await service
    .from('ally_invites')
    .select('id, org_id, claim_id, expires_at, max_uses, uses_count')
    .eq('token', body.invite_token)
    .maybeSingle()

  if (inviteErr) return err(inviteErr.message, 500)
  if (!invite) return err('Invite not found', 404)

  // Check if expired
  if (new Date((invite as any).expires_at) < new Date()) {
    return err('This invite has expired', 410)
  }

  // Check max uses
  const inv = invite as any
  if (inv.max_uses && inv.uses_count >= inv.max_uses) {
    return err('This invite has reached its maximum uses', 410)
  }

  // Check if this user already signed up as an ally for this org/claim
  const { data: existing } = await service
    .from('allies')
    .select('id')
    .eq('invite_id', inv.id)
    .eq('user_id', userId!)
    .maybeSingle()

  if (existing) return err('You have already signed up as an ally for this event', 409)

  // Determine headcount weight
  const isNationalBrother = body.national_brother ?? false
  const headcountWeight = isNationalBrother ? 0.75 : 0.50

  // Create the ally record
  const { data: ally, error: insertErr } = await service
    .from('allies')
    .insert({
      user_id: userId,
      org_id: inv.org_id,
      claim_id: inv.claim_id,
      invite_id: inv.id,
      name: body.name,
      email: body.email,
      university: body.university ?? null,
      graduation_year: body.graduation_year ?? null,
      greek_status: body.greek_status ?? 'unaffiliated',
      national_brother: isNationalBrother,
      headcount_weight: headcountWeight,
      expires_at: inv.expires_at,
    })
    .select('id, name, headcount_weight, national_brother')
    .single()

  if (insertErr) return err(insertErr.message, 500)

  // Increment invite uses count
  await service
    .from('ally_invites')
    .update({ uses_count: inv.uses_count + 1 })
    .eq('id', inv.id)

  return ok(ally, 201)
}

/**
 * GET /api/turf-wars/allies?org_id=xxx
 *
 * List allies for an org (for org admins to see who signed up).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('org_id')
  const claimId = searchParams.get('claim_id')

  if (!orgId) return err('org_id is required')

  const service = createServiceClient()

  // Verify the caller is a verified member of this org
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('org_id', orgId)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified member of this org to view allies', 403)

  let query = service
    .from('allies')
    .select(`
      id, name, email, university, graduation_year, greek_status,
      national_brother, headcount_weight, rush_credential_earned, created_at
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (claimId) query = query.eq('claim_id', claimId)

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}
