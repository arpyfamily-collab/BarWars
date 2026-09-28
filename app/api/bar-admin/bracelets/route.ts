import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'
import { requireBarAdmin } from '@/lib/bar-admin'

export const dynamic = 'force-dynamic'

/**
 * Bar Command Center → Bracelets (inventory in, hide). Brian, Sep 28: the bar scans each band in as it
 * arrives, then scans the band it's hiding and picks the night(s) it's good for.
 * GET ?venue_id=                         → tonight's numbers
 * POST { venue_id, action: 'receive', code }
 * POST { venue_id, action: 'hide', code, clue1, clue2?, clue3?, release2?, release3?, offer_type, offer_value?, night, nights }
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ERRORS: Record<string, [string, number]> = {
  UNKNOWN_BAND: ["That band isn't a BarWars tag.", 404],
  WRONG_BAR: ['That band belongs to another bar.', 409],
  ALREADY_USED_BAND: ['That band has already been hidden or found.', 409],
  NOT_RECEIVED: ['Scan this band in (Receive) before hiding it.', 409],
  CLUE_REQUIRED: ['Clue 1 is required.', 400],
  BAD_OFFER: ['Pick an offer type.', 400],
  BAD_NIGHT: ['Pick a night from tonight to 30 days out.', 400],
  BAD_NIGHTS: ['A bracelet is good for 1 to 7 nights.', 400],
  BAR_NAME_IN_CLUE: ["Clues and the offer can't name your bar. Players see only the clues, and the bar is revealed when they scan the bracelet.", 400],
}

export async function GET(req: NextRequest) {
  const venueId = new URL(req.url).searchParams.get('venue_id')
  const { userId, error } = await requireBarAdmin(venueId)
  if (error) return error
  const s = createServiceClient()
  const [{ data: summary }, { data: night }] = await Promise.all([
    s.rpc('bracelet_night_summary', { p_user: userId, p_venue: venueId }),
    s.rpc('bar_night'),
  ])
  return ok({ ...(summary as any), tonight: night })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { userId, error } = await requireBarAdmin(body.venue_id)
  if (error) return error
  const code = String(body.code ?? '').match(UUID)?.[0]
  if (!code) return err("Scan the band's BarWars tag.", 400)
  const s = createServiceClient()
  const { data, error: e } = body.action === 'receive'
    ? await s.rpc('receive_bracelet', { p_user: userId, p_venue: body.venue_id, p_qr: code })
    : body.action === 'hide'
      ? await s.rpc('hide_bracelet', {
          p_user: userId, p_venue: body.venue_id, p_qr: code, p_clue1: body.clue1 ?? '', p_clue2: body.clue2 || null, p_clue3: body.clue3 || null,
          p_release2: body.release2 ? new Date(body.release2).toISOString() : null, p_release3: body.release3 ? new Date(body.release3).toISOString() : null,
          p_offer_type: body.offer_type, p_offer_value: body.offer_value || null, p_night: body.night, p_nights: Number(body.nights) || 1,
        })
      : { data: null, error: { message: 'UNKNOWN_ACTION' } as any }
  if (e) {
    for (const [k, [m, st]] of Object.entries(ERRORS)) if (e.message.includes(k)) return err(m, st)
    return err(e.message.includes('UNKNOWN_ACTION') ? 'Unknown action' : 'Something went wrong.', 500)
  }
  return ok(data)
}
