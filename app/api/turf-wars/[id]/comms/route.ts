import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Comms Warfare for a war (Testing To-Do item 18 Phase 2).
 * GET → what this player can do (jams, orders, forgeries, decrypts) and what's frozen
 * POST { action: 'jam' | 'static' }                       → a side's spies or hired mercenaries jam or garble the enemy chat (one shared budget)
 * POST { action: 'order' | 'forge', template, bar_id? }   → leader's real Command notice / mole's forged one
 * Templates: regroup, fall_back, push (need a bar on the Square), hold. No free text, no rides, no leaving.
 */
const ERRORS: Record<string, [string, number]> = {
  WAR_NOT_LIVE: ['Comms warfare opens when the war goes live.', 409],
  WAR_NOT_ACTIVE: ['This war is over.', 409],
  NOT_ELIGIBLE: ["Only a side's spies and hired mercenaries can jam.", 403],
  NO_JAMS_LEFT: ['Your side has used its jams.', 409],
  ALREADY_FROZEN: ["Their chat is already frozen.", 409],
  TARGET_IMMUNE: ["Their signal just came back; they're immune for 10 minutes.", 409],
  NOT_LEADER: ['Only your org leader can issue Command orders.', 403],
  ORDER_LIMIT: ['You have issued 10 orders this war.', 409],
  NOT_A_MOLE: ['Only a mole inside the enemy can forge orders.', 403],
  FORGE_LIMIT: ['You have used both forgeries this war.', 409],
  BAD_BAR: ['Pick a bar on the Square.', 400],
  BAD_TEMPLATE: ['Pick an order.', 400],
  NO_WAR_CHAT: ["That side's war chat isn't open.", 409],
}
function mapError(raw: string) {
  for (const [code, [m, s]] of Object.entries(ERRORS)) if (raw.includes(code)) return err(m, s)
  return err('Something went wrong.', 500)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth()
  if (error) return error
  const { data, error: e } = await createServiceClient().rpc('comms_status', { p_user: userId, p_claim: params.id })
  if (e) return err('Could not load comms.', 500)
  return ok(data)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()
  // Jam and Static share one budget per side (Brian, Sep 28)
  if (body.action === 'jam' || body.action === 'static') {
    const { data, error: e } = await s.rpc('signal_jam', { p_user: userId, p_claim: params.id, p_kind: body.action })
    if (e) return mapError(e.message)
    const d: any = data
    return ok({ ...d, message: body.action === 'jam' ? `Jammed the ${d.target}s for ${d.minutes} minutes.` : `Static on the ${d.target}s for ${d.minutes} minutes: half their words come through garbled.` })
  }
  if (body.action === 'order' || body.action === 'forge') {
    const fn = body.action === 'order' ? 'command_order' : 'forge_order'
    const { data, error: e } = await s.rpc(fn, { p_user: userId, p_claim: params.id, p_template: String(body.template ?? ''), p_bar: body.bar_id || null })
    if (e) return mapError(e.message)
    return ok({ ...(data as any), message: body.action === 'order' ? 'Order sent to your side.' : 'Forged order planted in the enemy chat.' })
  }
  return err('Unknown action')
}
