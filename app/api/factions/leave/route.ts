import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/factions/leave  { type: 'greek'|'company'|'regiment'|'mercenary'|'spy', id? }
 * Leave a faction, or cancel a pending join request. The database applies the rules:
 * no leaving mid-war, 72-hour grace, cooldowns, captains step down instead.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  if (!['greek', 'company', 'regiment', 'mercenary', 'spy'].includes(body?.type)) return err('Unknown faction')
  if (['greek', 'company', 'regiment'].includes(body.type) && !body.id) return err('id is required')

  const { data, error } = await createServiceClient().rpc('leave_faction', {
    p_user: userId!, p_type: body.type, p_id: body.id ?? null, p_actor: null,
  })
  if (error) { const e = factionError(error.message); return err(e.message, e.status) }
  return ok(data)
}
