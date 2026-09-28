import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** GET ?code=  → the bar behind a door code and its live wars (for /scan/[code]). */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error
  const code = (new URL(req.url).searchParams.get('code') ?? '').toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{8}$/.test(code)) return err('Not a BarWars code', 404)
  const s = createServiceClient()
  const { data: bar } = await s.from('venues').select('id, name').eq('checkin_code', code).maybeSingle()
  if (!bar) return err('This code is out of date. Ask the bar for its current BarWars QR.', 404)
  const { data: wars } = await s.from('turf_claims')
    .select('id, status, attacker:greek_orgs!attacking_org_id(name), defender:greek_orgs!defending_org_id(name)')
    .eq('bar_id', (bar as any).id).in('status', ['live', 'contested'])
  return ok({ bar, wars: ((wars as any[]) ?? []).map(w => ({ id: w.id, attacker: w.attacker?.name, defender: w.defender?.name })) })
}
