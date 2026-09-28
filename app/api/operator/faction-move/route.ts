import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/operator/faction-move  { email, to_type: 'greek'|'company'|'regiment'|'none', to_id?, note }
 * Staff only: move a player between factions, bypassing cooldowns and locks, with a note.
 * Every move is recorded in faction_history with the note and who made it.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()

  const { data: me } = await s.from('profiles').select('is_staff').eq('id', userId!).maybeSingle()
  if (!(me as any)?.is_staff) return err('Staff only', 403)
  if (!body?.email || !body?.to_type || !body?.note?.trim()) return err('email, to_type and note are required')
  if (body.to_type !== 'none' && !body.to_id) return err('to_id is required')

  const { data: users, error: lookupErr } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (lookupErr) return err('Could not look up the player', 500)
  const target = users.users.find(u => u.email?.toLowerCase() === String(body.email).trim().toLowerCase())
  if (!target) return err('No player with that email', 404)

  const { data, error } = await s.rpc('staff_move_player', {
    p_staff: userId!, p_user: target.id, p_to_type: body.to_type, p_to_id: body.to_type === 'none' ? null : body.to_id, p_note: body.note.trim(),
  })
  if (error) { const e = factionError(error.message); return err(e.message, e.status) }
  return ok(data)
}
