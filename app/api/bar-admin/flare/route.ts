import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'
import { requireBarAdmin } from '@/lib/bar-admin'

export const dynamic = 'force-dynamic'

/**
 * Fire a Flare. Replaces the flare-fire edge function, which trusted venue_id and fired_by from the
 * request (anyone signed in could fire for any bar). The database now refuses Flares from anywhere else.
 * POST { venue_id, offer_text, discount_desc, duration_min }
 */
const ERRORS: Record<string, [string, number]> = {
  FLARE_COOLDOWN: ['Cooldown active: you fired a Flare in the last 4 hours.', 429],
  NO_FLARE_CREDITS: ['No Flare credits left this week.', 403],
  MISSING_FIELDS: ['Offer text and discount description are required.', 400],
  NOT_BAR_ADMIN: ['You are not an admin of this bar.', 403],
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { userId, error } = await requireBarAdmin(body.venue_id)
  if (error) return error
  const minutes = Math.min(240, Math.max(15, Number(body.duration_min) || 60))
  const { data, error: e } = await createServiceClient().rpc('fire_flare', {
    p_user: userId, p_venue: body.venue_id, p_offer: String(body.offer_text ?? ''), p_discount: String(body.discount_desc ?? ''), p_minutes: minutes,
  })
  if (e) {
    for (const [code, [message, status]] of Object.entries(ERRORS)) if (e.message.includes(code)) return err(message, status)
    return err('Could not fire the Flare.', 500)
  }
  return ok({ success: true, flare: data }, 201)
}
