import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'
import { requireBarAdmin } from '@/lib/bar-admin'

export const dynamic = 'force-dynamic'

/** Bar admins: the door QR code players scan to check in at full strength. GET ?venue_id=, POST { venue_id } resets it. */
export async function GET(req: NextRequest) {
  const venueId = new URL(req.url).searchParams.get('venue_id')
  const { error } = await requireBarAdmin(venueId)
  if (error) return error
  const { data } = await createServiceClient().from('venues').select('name, checkin_code').eq('id', venueId!).maybeSingle()
  return ok({ name: (data as any)?.name, code: (data as any)?.checkin_code })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { userId, error } = await requireBarAdmin(body.venue_id)
  if (error) return error
  const { data, error: e } = await createServiceClient().rpc('reset_door_code', { p_user: userId, p_venue: body.venue_id })
  if (e) return err('Could not reset the code.', 500)
  return ok({ code: data })
}
