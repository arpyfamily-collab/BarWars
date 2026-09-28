import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** My Bracelets: every bracelet voucher this player holds (found and kept, or claimed from the Armory). */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const { data } = await createServiceClient().rpc('my_bracelets', { p_user: userId })
  return ok({ bracelets: data ?? [] })
}
