import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { checkPushCredentials } from '@/lib/push'

export const dynamic = 'force-dynamic'

/** Staff only: confirm Apple and Firebase accept our push credentials. */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const { data: me } = await createServiceClient().from('profiles').select('is_staff').eq('id', userId!).maybeSingle()
  if (!(me as any)?.is_staff) return err('Staff only', 403)
  return ok(await checkPushCredentials())
}
