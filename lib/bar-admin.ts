import { createServiceClient } from '@/lib/supabase'
import { requireAuth, err } from '@/lib/challenges'

/** Signed-in user who is an admin of this bar (or staff). Checked on the server, never trusted from the client. */
export async function requireBarAdmin(venueId: string | null | undefined) {
  const { userId, error } = await requireAuth()
  if (error) return { userId: null, error }
  if (!venueId || !/^[0-9a-f-]{36}$/i.test(venueId)) return { userId: null, error: err('venue_id is required') }
  const { data } = await createServiceClient().rpc('is_bar_admin', { p_user: userId, p_venue: venueId })
  if (!data) return { userId: null, error: err('You are not an admin of this bar.', 403) }
  return { userId: userId!, error: null }
}
