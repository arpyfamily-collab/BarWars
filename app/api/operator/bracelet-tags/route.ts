import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** Staff: print a batch of band tags for a bar (1-100). Each becomes a band "in stock" once the bar scans it in. */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const { data: me } = await s.from('profiles').select('is_staff').eq('id', userId!).maybeSingle()
  if (!(me as any)?.is_staff) return err('Staff only', 403)
  const { data } = await s.from('venues').select('id, name').order('name')
  return ok({ venues: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('print_bracelet_tags', { p_staff: userId, p_venue: body.venue_id, p_count: Number(body.count) || 0 })
  if (e) return err(e.message.includes('STAFF_ONLY') ? 'Staff only' : e.message.includes('BAD_COUNT') ? 'Print 1 to 100 tags at a time.' : 'Could not create tags.', e.message.includes('STAFF_ONLY') ? 403 : 400)
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://app.barwars.app'
  return ok({ tags: ((data as string[]) ?? []).map(t => ({ code: t, url: `${origin}/b/${t}` })) })
}
