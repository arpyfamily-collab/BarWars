import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Door Mode (Brian, Sep 28): door staff scan a player's bracelet voucher; green = valid and now used.
 * GET → the bars this person can work the door for, with tonight's count
 * POST { venue_id, payload } → redeem (payload is the scanned QR text or the 6-character code)
 */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const [{ data: admin }, { data: door }] = await Promise.all([
    s.from('bar_admins').select('bar_id').eq('user_id', userId!).or('is_bar_asset.is.null,is_bar_asset.eq.false'),
    s.from('bar_door_staff').select('venue_id').eq('user_id', userId!).is('removed_at', null),
  ])
  const ids = Array.from(new Set([...((admin as any[]) ?? []).map(a => a.bar_id), ...((door as any[]) ?? []).map(d => d.venue_id)]))
  if (!ids.length) return ok({ venues: [] })
  const { data: venues } = await s.from('venues').select('id, name').in('id', ids).order('name')
  const out = []
  for (const v of (venues as any[]) ?? []) {
    const { data: sum } = await s.rpc('bracelet_night_summary', { p_user: userId, p_venue: v.id })
    out.push({ ...v, redeemed_tonight: (sum as any)?.redeemed_tonight ?? 0 })
  }
  return ok({ venues: out })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('redeem_voucher', { p_user: userId, p_venue: body.venue_id, p_payload: String(body.payload ?? '') })
  if (e) return err(e.message.includes('NOT_DOOR_STAFF') ? "You're not on this bar's door staff." : 'Could not check that code.', e.message.includes('NOT_DOOR_STAFF') ? 403 : 500)
  return ok(data)
}
