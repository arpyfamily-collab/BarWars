import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sendPush } from '@/lib/push'

export const dynamic = 'force-dynamic'

/**
 * Server-to-server push (Supabase edge functions → here). Authorized with the Supabase service-role key,
 * which both sides already hold; players can never call it.
 * POST { user_ids: string[], title, body, data? }
 */
export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(got), b = Buffer.from(key)
  if (!key || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (!Array.isArray(body.user_ids) || !body.title || !body.body) return NextResponse.json({ error: 'user_ids, title, body required' }, { status: 400 })
  const data = Object.fromEntries(Object.entries(body.data ?? {}).map(([k, v]) => [k, String(v)]))
  const r = await sendPush(body.user_ids.slice(0, 5000), { title: String(body.title).slice(0, 120), body: String(body.body).slice(0, 400), data })
  return NextResponse.json(r)
}
