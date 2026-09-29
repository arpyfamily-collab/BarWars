import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { sendCode, checkCode, toUSE164, twilioConfigured } from '@/lib/twilio-verify'

export const dynamic = 'force-dynamic'

/**
 * POST /api/verify/phone
 *
 * Item 16 (Sep 29): Twilio Verify texts the code and checks it. We never store or return it (the old
 * version handed the code back to the app in "dev_otp", so anyone could verify any number).
 *
 * Send code:   { phone }                     → texts a 6-digit code (US numbers only for the pilot)
 * Check code:  { verification_id, code }     → on success sets profiles.phone_verified = true
 * One phone number, one account: a number already verified elsewhere is refused. (It used to flag both
 * accounts, which let anyone get a rival flagged by typing in their number.)
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

    let approved = false
    try { approved = await checkCode(v.phone, String(body.code).replace(/\D/g, '')) }
    catch { return err("Couldn't check the code right now. Try again in a minute.", 502) }
    if (!approved) return err('Incorrect or expired code', 400)

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
  const phone = toUSE164(body.phone)
  if (!phone) return err('Enter a US mobile number.', 400)
  if (!twilioConfigured()) return err('Phone verification is not set up yet.', 503)

  // One phone number, one account. Refuse without flagging anyone (flagging let people grief rivals).
  const { data: existingPhone } = await service
    .from('phone_verifications')
    .select('user_id')
    .eq('phone', phone)
    .eq('verified', true)
    .neq('user_id', userId!)
    .limit(1)
    .maybeSingle()
  if (existingPhone) return err('This phone number is already verified on another account.', 409)

  // One pending code at a time (Twilio codes last 10 minutes)
  const { data: recentOtp } = await service
    .from('phone_verifications')
    .select('id, expires_at')
    .eq('user_id', userId!)
    .eq('verified', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recentOtp) return err('A code is already on its way. Wait a few minutes before asking for another.', 429)

  try { await sendCode(phone) }
  catch (e: any) {
    if (e.code === 60200 || e.code === 21211) return err("That number can't receive texts. Check it and try again.", 400)
    if (e.code === 60203) return err('Too many codes sent to this number. Try again later.', 429)
    if (e.code === 60410) return err('This number is blocked from verification.', 403)
    return err("Couldn't send the text right now. Try again in a minute.", 502)
  }

  const { data, error } = await service
    .from('phone_verifications')
    .insert({ user_id: userId!, phone, otp_code: null, verified: false, attempts: 0 })
    .select('id, phone, expires_at')
    .single()
  if (error) return err('Could not start verification.', 500)

  return ok({
    verification_id: (data as any).id,
    phone: (data as any).phone,
    expires_at: (data as any).expires_at,
    message: `Code sent to ${phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}.`,
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
