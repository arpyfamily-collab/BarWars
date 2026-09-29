import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sendPush } from '@/lib/push'

export const dynamic = 'force-dynamic'

/**
 * Server-to-server push (Supabase edge functions → here). Authorized with a Supabase service key (either
 * format), which both sides already hold; players can never call it.
 * POST { user_ids: string[], title, body, data? }
 */
// Supabase functions may hold the service key in a different format than Vercel does, so a key is accepted
// if it matches ours exactly or if Supabase confirms it has admin rights.
async function isServiceKey(key: string): Promise<boolean> {
  if (!key) return false
  const own = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (own) { const a = Buffer.from(key), b = Buffer.from(own); if (a.length === b.length && timingSafeEqual(a, b)) return true }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
  return r.ok
}

export async function POST(req: NextRequest) {
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!(await isServiceKey(got))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (!Array.isArray(body.user_ids) || !body.title || !body.body) return NextResponse.json({ error: 'user_ids, title, body required' }, { status: 400 })
  const data = Object.fromEntries(Object.entries(body.data ?? {}).map(([k, v]) => [k, String(v)]))
  const r = await sendPush(body.user_ids.slice(0, 5000), { title: String(body.title).slice(0, 120), body: String(body.body).slice(0, 400), data })
  return NextResponse.json(r)
}
