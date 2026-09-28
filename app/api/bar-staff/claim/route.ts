import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** Accept a bar's private staff invite (item 11). Any failure reads the same, so the path can't be probed. */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('claim_staff_invite', { p_user: userId, p_token: String(body.token ?? '') })
  if (e) return err(e.message.includes('AGE_REQUIRED') ? 'Confirm you are 18 or older on your account first.' : "This link isn't valid.", 400)
  return ok({ ok: true, kind: (data as any)?.kind ?? 'staff_spy' })
}
