import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/allies/invite
 *
 * Generate an ally invite link. Any verified org member can generate one.
 * The invite is tied to a specific claim (if provided) and expires when
 * the claim resolves, or after 72 hours for general invites.
 *
 * Body: { claim_id?: string }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { claim_id?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // Find the caller's verified org membership
  const { data: membership } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)
    .maybeSingle()

  if (!membership) return err('You must be a verified member of a Greek org to invite allies', 403)

  const orgId = (membership as any).org_id
  let expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72hr default

  // If tied to a claim, expire when the claim window closes
  if (body.claim_id) {
    const { data: claim } = await service
      .from('turf_claims')
      .select('window_close_at, status')
      .eq('id', body.claim_id)
      .maybeSingle()

    if (claim) {
      const windowClose = new Date((claim as any).window_close_at)
      if (windowClose > new Date()) {
        expiresAt = windowClose.toISOString()
      }
    }
  }

  const token = randomBytes(24).toString('hex')

  const { data: invite, error: insertErr } = await service
    .from('ally_invites')
    .insert({
      org_id: orgId,
      claim_id: body.claim_id ?? null,
      token,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select('id, token, expires_at')
    .single()

  if (insertErr) return err(insertErr.message, 500)

  return ok({
    ...invite,
    invite_url: `/turf-wars/allies/join?token=${token}`,
  }, 201)
}

/**
 * GET /api/turf-wars/allies/invite?token=xxx
 *
 * Look up an invite by token (for the signup page).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) return err('token is required')

  const service = createServiceClient()

  const { data: invite, error } = await service
    .from('ally_invites')
    .select(`
      id, token, expires_at, max_uses, uses_count,
      org:greek_orgs(name, org_type),
      claim:turf_claims(bar:venues(name), window_close_at)
    `)
    .eq('token', token)
    .maybeSingle()

  if (error) return err(error.message, 500)
  if (!invite) return err('Invite not found', 404)

  // Check if expired
  if (new Date((invite as any).expires_at) < new Date()) {
    return err('This invite has expired', 410)
  }

  return ok(invite)
}
