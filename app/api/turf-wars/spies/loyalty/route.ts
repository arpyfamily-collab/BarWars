import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getLedHandlers } from '@/lib/spy-handlers'

export const dynamic = 'force-dynamic'

/**
 * Loyalty sweeps (Testing To-Do item 24). An org leader sends fake spy approaches to a random
 * quarter of their members (1 to 10), once every 30 days. Accepting flags susceptibility, reporting
 * earns High Loyalty; leaders get private alerts and counts, never names.
 * GET  → sweep status for each org the caller leads
 * POST { org_id } → order a sweep
 */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const led = await getLedHandlers(s, userId!)
  const out = []
  for (const orgId of led.orgIds) {
    const { data } = await s.rpc('loyalty_sweep_status', { p_user: userId, p_org: orgId })
    const { data: org } = await s.from('greek_orgs').select('name').eq('id', orgId).maybeSingle()
    out.push({ org_id: orgId, org_name: (org as any)?.name ?? null, ...(data as any) })
  }
  return ok({ orgs: out })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('order_loyalty_sweep', { p_user: userId, p_org: body.org_id })
  if (e) {
    if (e.message.includes('NOT_LEADER')) return err('Only your org leader can order a loyalty sweep.', 403)
    const cd = e.message.match(/SWEEP_COOLDOWN:([A-Za-z]{3} \d{2})/)
    if (cd) return err(`One sweep every 30 days. Next one: ${cd[1]}.`, 429)
    if (e.message.includes('NO_TARGETS')) return err('No members available to test right now.', 409)
    return err('Could not order the sweep.', 500)
  }
  return ok({ ...(data as any), message: `Loyalty sweep sent to ${(data as any).targets} member${(data as any).targets === 1 ? '' : 's'}. Names are never shown.` }, 201)
}
