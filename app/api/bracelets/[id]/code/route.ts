import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** The voucher's door code: it changes every 30 seconds, so a screenshot is useless a minute later. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth()
  if (error) return error
  const { data, error: e } = await createServiceClient().rpc('voucher_code', { p_user: userId, p_bracelet: params.id })
  if (e) return err(e.message.includes('ALREADY_USED') ? 'Already used.' : 'Not your bracelet.', e.message.includes('ALREADY_USED') ? 409 : 404)
  return ok(data)
}
