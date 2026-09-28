import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/factions/captain  { type: 'company'|'regiment', id, action, nominee_id? }
 *   step_down  — captain starts the 3-day notice (or leaves at once within the 72-hour grace)
 *   nominate   — captain names the member they want to take over
 *   accept     — the nominee accepts and becomes captain now
 *   cancel     — captain changes their mind
 *   remove     — captain removes a member (member_id); no cooldown for the removed player
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  if (!['company', 'regiment'].includes(body?.type) || !body.id) return err('type and id are required')

  const s = createServiceClient()
  const args = { p_user: userId!, p_type: body.type, p_id: body.id }
  let result
  switch (body.action) {
    case 'step_down': result = await s.rpc('start_stepdown', args); break
    case 'nominate':
      if (!body.nominee_id) return err('nominee_id is required')
      result = await s.rpc('nominate_successor', { ...args, p_nominee: body.nominee_id }); break
    case 'accept': result = await s.rpc('accept_captaincy', args); break
    case 'cancel': result = await s.rpc('cancel_stepdown', args); break
    case 'remove': {
      if (!body.member_id) return err('member_id is required')
      const table = body.type === 'company' ? 'hessian_companies' : 'regiments'
      const { data: unit } = await s.from(table).select('captain_id').eq('id', body.id).maybeSingle()
      if (!unit || (unit as any).captain_id !== userId) return err('Only the captain can remove members', 403)
      result = await s.rpc('leave_faction', { p_user: body.member_id, p_type: body.type, p_id: body.id, p_actor: userId! }); break
    }
    default: return err('Unknown action')
  }
  if (result.error) { const e = factionError(result.error.message); return err(e.message, e.status) }
  return ok(result.data ?? { ok: true })
}
