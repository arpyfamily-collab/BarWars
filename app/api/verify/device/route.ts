import { NextRequest } from 'next/server'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/verify/device
 * Register or update a device fingerprint for the caller.
 * Body: { device_id: string }
 * Checks if this device is already used by another active account.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { device_id: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.device_id || body.device_id.length < 8) {
    return err('device_id is required (min 8 characters)')
  }

  const service = createServiceClient()

  // Check if this device is already registered to a DIFFERENT active account
  const { data: existingDevice } = await service
    .from('device_fingerprints')
    .select('user_id, is_blocked')
    .eq('device_id', body.device_id)
    .neq('user_id', userId!)
    .maybeSingle()

  if (existingDevice) {
    // Device is shared — flag both accounts
    await service
      .from('profiles')
      .update({ account_status: 'flagged' })
      .eq('id', userId!)

    await service
      .from('profiles')
      .update({ account_status: 'flagged' })
      .eq('id', (existingDevice as any).user_id)

    // Block the device
    await service
      .from('device_fingerprints')
      .update({ is_blocked: true })
      .eq('device_id', body.device_id)

    return err('This device is already associated with another account. Both accounts have been flagged.', 403)
  }

  // Check if device is already registered to this user
  const { data: myDevice } = await service
    .from('device_fingerprints')
    .select('id, is_blocked')
    .eq('user_id', userId!)
    .eq('device_id', body.device_id)
    .maybeSingle()

  if (myDevice) {
    if ((myDevice as any).is_blocked) {
      return err('This device has been blocked from event participation.', 403)
    }
    // Update last_seen
    await service
      .from('device_fingerprints')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', (myDevice as any).id)

    // Mark device_verified on profile
    await service
      .from('profiles')
      .update({ device_verified: true })
      .eq('id', userId!)

    return ok({ device_id: body.device_id, message: 'Device verified.' })
  }

  // Register new device
  const { data, error } = await service
    .from('device_fingerprints')
    .insert({
      user_id: userId!,
      device_id: body.device_id,
      is_primary: true,
      is_blocked: false,
    })
    .select('id, device_id, is_primary')
    .single()

  if (error) return err(error.message, 500)

  // Mark device_verified on profile
  await service
    .from('profiles')
    .update({ device_verified: true })
    .eq('id', userId!)

  return ok({ ...data, message: 'Device registered and verified.' }, 201)
}

/**
 * GET /api/verify/device
 * Returns the caller's registered devices and verification status.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: devices } = await service
    .from('device_fingerprints')
    .select('id, device_id, is_primary, is_blocked, first_seen_at, last_seen_at')
    .eq('user_id', userId!)
    .order('first_seen_at', { ascending: false })

  const { data: profile } = await service
    .from('profiles')
    .select('device_verified, account_status')
    .eq('id', userId!)
    .maybeSingle()

  return ok({
    devices: (devices as any[]) ?? [],
    device_verified: (profile as any)?.device_verified ?? false,
    account_status: (profile as any)?.account_status ?? 'active',
  })
}
