import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/verify/status
 * Returns the caller's complete verification status across all layers.
 * This is the single endpoint the UI calls to show verification badges.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: profile } = await service
    .from('profiles')
    .select(`
      full_name, phone, is_staff, age_verified, location_opt_in, push_opt_in,
      device_verified, phone_verified, edu_verified, account_status, is_burner,
      registered_at_event, created_at
    `)
    .eq('id', userId!)
    .maybeSingle()

  if (!profile) return err('Profile not found', 404)

  const p = profile as any

  // Get device count
  const { data: devices } = await service
    .from('device_fingerprints')
    .select('id, is_primary, is_blocked, last_seen_at')
    .eq('user_id', userId!)

  // Get .edu verification records
  const { data: eduVers } = await service
    .from('edu_verifications')
    .select('id, edu_email, verified')
    .eq('user_id', userId!)

  // Determine eligibility
  let eligibility = 'eligible'
  if (p.account_status === 'blocked') eligibility = 'blocked'
  else if (p.is_burner) eligibility = 'flagged'
  else if (!p.device_verified) eligibility = 'needs_device'
  else if (!p.phone_verified) eligibility = 'needs_phone'

  // .edu is required for high-stakes roles but not for browsing/ghosts
  const high_stakes_ready = p.edu_verified && p.phone_verified && p.device_verified && p.account_status === 'active'

  return ok({
    profile: {
      full_name: p.full_name,
      phone: p.phone,
      account_status: p.account_status,
      is_burner: p.is_burner,
      created_at: p.created_at,
    },
    verification: {
      device_verified: p.device_verified,
      phone_verified: p.phone_verified,
      edu_verified: p.edu_verified,
      age_verified: p.age_verified,
    },
    devices: {
      count: (devices as any[])?.length ?? 0,
      has_blocked: (devices as any[])?.some(d => d.is_blocked) ?? false,
    },
    edu_emails: (eduVers as any[]) ?? [],
    eligibility,
    high_stakes_ready,
    can_participate: eligibility === 'eligible' || eligibility === 'needs_verification' && p.phone_verified,
  })
}
