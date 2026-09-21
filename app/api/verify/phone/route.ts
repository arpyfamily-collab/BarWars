import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * POST /api/verify/phone
 *
 * Send OTP:
 *   { phone: string }
 *   Creates a phone_verifications row with a 6-digit OTP.
 *   Velocity check: if this phone number is already used by another
 *   account, both accounts get flagged.
 *
 * Verify OTP:
 *   { verification_id: string, code: string }
 *   Marks verified=true if code matches and not expired.
 *   On success, sets profiles.phone_verified = true.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Verify OTP ─────────────────────────────────────────────────────────────
  if (body.verification_id && body.code) {
    const { data: ver, error: verErr } = await service
      .from('phone_verifications')
      .select('id, user_id, phone, otp_code, verified, attempts, expires_at')
      .eq('id', body.verification_id)
      .eq('user_id', userId!)
      .maybeSingle()

    if (verErr) return err(verErr.message, 500)
    if (!ver) return err('Verification not found', 404)

    const v = ver as any
    if (v.verified) return err('Already verified', 409)
    if (new Date(v.expires_at) < new Date()) return err('OTP expired. Request a new code.', 410)
    if (v.attempts >= 5) return err('Too many attempts. Request a new code.', 429)

    // Increment attempts
    await service
      .from('phone_verifications')
      .update({ attempts: v.attempts + 1 })
      .eq('id', body.verification_id)

    if (v.otp_code !== body.code) {
      return err('Incorrect code', 400)
    }

    // Correct code — mark verified
    await service
      .from('phone_verifications')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', body.verification_id)

    // Update profile
    await service
      .from('profiles')
      .update({ phone_verified: true, phone: v.phone })
      .eq('id', userId!)

    return ok({ phone: v.phone, verified: true, message: 'Phone number verified.' })
  }

  // ─── Send OTP ───────────────────────────────────────────────────────────────
  if (!body.phone) return err('phone is required')
  const phone = body.phone.replace(/\s/g, '')

  // Basic phone validation
  if (phone.length < 10) return err('Invalid phone number')

  // Velocity check: has this phone been used by another account?
  const { data: existingPhone } = await service
    .from('phone_verifications')
    .select('user_id')
    .eq('phone', phone)
    .eq('verified', true)
    .neq('user_id', userId!)
    .maybeSingle()

  if (existingPhone) {
    // Flag both accounts — same phone number across accounts
    await service
      .from('profiles')
      .update({ account_status: 'flagged' })
      .eq('id', userId!)

    await service
      .from('profiles')
      .update({ account_status: 'flagged' })
      .eq('id', (existingPhone as any).user_id)

    return err('This phone number is already verified on another account. Both accounts have been flagged for review.', 403)
  }

  // Check for recent unexpired OTP to prevent spam
  const { data: recentOtp } = await service
    .from('phone_verifications')
    .select('id, expires_at')
    .eq('user_id', userId!)
    .eq('verified', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentOtp) {
    return err('You already have a pending code. Wait for it to expire or verify it.', 429)
  }

  const otp = generateOTP()

  const { data, error } = await service
    .from('phone_verifications')
    .insert({
      user_id: userId!,
      phone,
      otp_code: otp,
      verified: false,
      attempts: 0,
    })
    .select('id, phone, expires_at')
    .single()

  if (error) return err(error.message, 500)

  // In production, send OTP via Twilio SMS here.
  // For now, return the OTP in the response for development.
  // The client should NOT display this in production — it's for dev only.
  return ok({
    verification_id: (data as any).id,
    phone: (data as any).phone,
    expires_at: (data as any).expires_at,
    dev_otp: otp, // REMOVE IN PRODUCTION — use Twilio instead
    message: 'Verification code sent. (Development mode: code is included in response.)',
  }, 201)
}

/**
 * GET /api/verify/phone
 * Returns the caller's phone verification status.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: profile } = await service
    .from('profiles')
    .select('phone, phone_verified')
    .eq('id', userId!)
    .maybeSingle()

  const { data: pending } = await service
    .from('phone_verifications')
    .select('id, phone, expires_at, attempts')
    .eq('user_id', userId!)
    .eq('verified', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return ok({
    phone: (profile as any)?.phone ?? null,
    phone_verified: (profile as any)?.phone_verified ?? false,
    pending_verification: pending ?? null,
  })
}
