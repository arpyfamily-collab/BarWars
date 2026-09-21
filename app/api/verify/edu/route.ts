import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/verify/edu
 *
 * Request .edu verification:
 *   { edu_email: string }
 *   Validates the email ends in .edu, creates a verification record,
 *   and "sends" a verification link (in production, via email).
 *
 * Confirm .edu verification (from email link):
 *   { token: string }
 *   Marks verified=true.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Confirm via token ──────────────────────────────────────────────────────
  if (body.token) {
    const { data: ver, error: verErr } = await service
      .from('edu_verifications')
      .select('id, user_id, edu_email, verified')
      .eq('verification_token', body.token)
      .maybeSingle()

    if (verErr) return err(verErr.message, 500)
    if (!ver) return err('Invalid verification token', 404)

    const v = ver as any
    if (v.verified) return err('Already verified', 409)
    if (v.user_id !== userId) return err('This verification link belongs to a different account', 403)

    await service
      .from('edu_verifications')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', v.id)

    await service
      .from('profiles')
      .update({ edu_verified: true })
      .eq('id', userId!)

    return ok({ edu_email: v.edu_email, verified: true, message: 'University email verified. You can now participate in high-stakes roles.' })
  }

  // ─── Request verification ───────────────────────────────────────────────────
  if (!body.edu_email) return err('edu_email is required')

  const email = body.edu_email.toLowerCase().trim()

  // Validate .edu domain
  if (!email.endsWith('.edu')) {
    return err('Email must end in .edu (university email required)')
  }

  if (!email.includes('@')) return err('Invalid email format')

  // Check if already used by another account
  const { data: existing } = await service
    .from('edu_verifications')
    .select('user_id')
    .eq('edu_email', email)
    .eq('verified', true)
    .neq('user_id', userId!)
    .maybeSingle()

  if (existing) {
    return err('This .edu email is already verified on another account', 409)
  }

  // Check if user already has a pending or verified record
  const { data: myExisting } = await service
    .from('edu_verifications')
    .select('id, verified')
    .eq('user_id', userId!)
    .eq('edu_email', email)
    .maybeSingle()

  if (myExisting) {
    if ((myExisting as any).verified) return err('Already verified', 409)
    // Re-send with new token
    await service
      .from('edu_verifications')
      .update({ verification_token: crypto.randomUUID() })
      .eq('id', (myExisting as any).id)

    const { data: refreshed } = await service
      .from('edu_verifications')
      .select('id, edu_email, verification_token')
      .eq('id', (myExisting as any).id)
      .single()

    return ok({
      ...refreshed,
      message: 'Verification link regenerated. Check your university email.',
      dev_verify_url: `/api/verify/edu?token=${(refreshed as any).verification_token}`,
    })
  }

  const { data, error } = await service
    .from('edu_verifications')
    .insert({
      user_id: userId!,
      edu_email: email,
      verified: false,
    })
    .select('id, edu_email, verification_token')
    .single()

  if (error) return err(error.message, 500)

  // In production, send verification email here via Resend/SendGrid.
  return ok({
    ...data,
    message: 'Verification link sent to your university email. (Development mode: use the dev_verify_url to confirm.)',
    dev_verify_url: `/api/verify/edu?token=${(data as any).verification_token}`,
  }, 201)
}

/**
 * GET /api/verify/edu
 * Returns the caller's .edu verification status.
 * ?token=xxx — used as email link confirmation redirect.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  const service = createServiceClient()

  if (token) {
    // Auto-confirm from email link
    const { data: ver } = await service
      .from('edu_verifications')
      .select('id, user_id, edu_email, verified')
      .eq('verification_token', token)
      .maybeSingle()

    if (!ver) return err('Invalid or expired verification link', 404)

    const v = ver as any
    if (v.user_id !== userId) return err('This verification link belongs to a different account', 403)
    if (v.verified) return ok({ edu_email: v.edu_email, verified: true, message: 'Already verified.' })

    await service
      .from('edu_verifications')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', v.id)

    await service
      .from('profiles')
      .update({ edu_verified: true })
      .eq('id', userId!)

    return ok({ edu_email: v.edu_email, verified: true, message: 'University email verified!' })
  }

  const { data: profile } = await service
    .from('profiles')
    .select('edu_verified')
    .eq('id', userId!)
    .maybeSingle()

  const { data: verifications } = await service
    .from('edu_verifications')
    .select('id, edu_email, verified, created_at')
    .eq('user_id', userId!)
    .order('created_at', { ascending: false })

  return ok({
    edu_verified: (profile as any)?.edu_verified ?? false,
    verifications: (verifications as any[]) ?? [],
  })
}
