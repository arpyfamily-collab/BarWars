import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** Decrypt a Command notice (item 18 Phase 2): the side's intel cell or leader, 2 per side per war; works during a jam. */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('decrypt_notice', { p_user: userId, p_message: body.message_id })
  if (e) {
    if (e.message.includes('NOT_IN_CELL')) return err('Only your intel cell can decrypt.', 403)
    if (e.message.includes('NO_DECRYPTS_LEFT')) return err('Your side has used both decrypts.', 409)
    if (e.message.includes('NOT_A_NOTICE')) return err('Not a Command notice.', 404)
    return err('Could not decrypt.', 500)
  }
  return ok(data)
}
