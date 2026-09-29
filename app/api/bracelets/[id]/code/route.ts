import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** The voucher's door code: it changes every 30 seconds, so a screenshot is useless a minute later. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth()
  if (error) return error
  const { data, error: e } = await createServiceClient().rpc('voucher_code', { p_user: userId, p_bracelet: params.id })
  if (e) {
    if (e.message.includes('ALREADY_USED')) return err('Already used.', 409)
    if (e.message.includes('IN_ESCROW')) return err("This bracelet is held as payment on a mercenary contract.", 409)
    return err('Not your bracelet.', 404)
  }
  return ok(data)
}
