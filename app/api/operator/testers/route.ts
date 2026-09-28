import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Tester accounts (Testing To-Do item 6). Staff only.
 * GET                         → current testers
 * POST { email, on: boolean } → make a player a tester, or not
 * POST { all_off: true }      → turn every tester off at once (before launch)
 * Turning a tester off also ends any virtual placement on the War Map.
 */
async function staff(s: any, userId: string) {
  const { data } = await s.from('profiles').select('is_staff').eq('id', userId).maybeSingle()
  return !!(data as any)?.is_staff
}

async function clearPlacements(s: any, ids: string[]) {
  if (ids.length === 0) return
  await s.from('user_skin_loadout')
    .update({ virtual_until: null, in_war_zone: false, at_venue_id: null, last_location_at: null })
    .in('user_id', ids).not('virtual_until', 'is', null)
}

async function listTesters(s: any) {
  const { data } = await s.from('profiles').select('id').eq('is_tester', true)
  const ids = ((data as any[]) ?? []).map(r => r.id)
  if (ids.length === 0) return []
  const { data: users } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const { data: names } = await s.from('public_profiles').select('id, display_name').in('id', ids)
  return ids.map(id => ({
    id,
    email: users?.users.find((u: any) => u.id === id)?.email ?? null,
    name: ((names as any[]) ?? []).find(n => n.id === id)?.display_name ?? 'Player',
  }))
}

export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  return ok(await listTesters(s))
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)

  if (body.all_off === true) {
    const { data } = await s.from('profiles').select('id').eq('is_tester', true)
    const ids = ((data as any[]) ?? []).map(r => r.id)
    if (ids.length) await s.from('profiles').update({ is_tester: false }).in('id', ids)
    await clearPlacements(s, ids)
    return ok({ turned_off: ids.length, testers: [] })
  }

  if (!body.email || typeof body.on !== 'boolean') return err('email and on are required')
  const { data: users, error: lookupErr } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (lookupErr) return err('Could not look up the player', 500)
  const target = users.users.find(u => u.email?.toLowerCase() === String(body.email).trim().toLowerCase())
  if (!target) return err('No player with that email. They need to sign up first.', 404)

  const { error } = await s.from('profiles').update({ is_tester: body.on }).eq('id', target.id)
  if (error) return err('Could not update that player', 500)
  if (!body.on) await clearPlacements(s, [target.id])
  return ok({ email: target.email, tester: body.on, testers: await listTesters(s) })
}
