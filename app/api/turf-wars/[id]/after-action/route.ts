import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** After-Action Report (item 18 Phase 2, in-app for now): only once the war is decided. Moles are never named. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth()
  if (error) return error
  const { data } = await createServiceClient().rpc('after_action_report', { p_claim: params.id })
  if (!data) return err('The report is ready when the war is decided.', 404)
  return ok(data)
}
