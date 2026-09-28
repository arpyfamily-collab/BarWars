import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getLedHandlers } from '@/lib/spy-handlers'
import { spyError } from '@/lib/spy-errors'

export const dynamic = 'force-dynamic'

const ACTIVE = ['pending', 'operator_pending', 'live', 'contested']

/**
 * Intel cells (Testing To-Do item 12). For each side the caller leads (org leader, or captain of a
 * Hessian company contracted for a war), every active war that side is in, its cell, and the
 * members the leader can pick from.
 * GET  → [{ claim_id, bar, side_type, side_id, side_name, cell: [{ user_id, name }], candidates }]
 * POST { claim_id, org_id | company_id, member_ids } → set the cell (leader + up to 2)
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const s = createServiceClient()
  const { orgIds, companyIds } = await getLedHandlers(s, userId!)
  const out: any[] = []

  const nameMap = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>()
    const { data } = await s.from('public_profiles').select('id, display_name').in('id', ids)
    return new Map(((data as any[]) ?? []).map(n => [n.id, n.display_name]))
  }

  const addSide = async (sideType: 'org' | 'company', sideId: string, sideName: string, claimIds: string[], memberIds: string[]) => {
    if (!claimIds.length) return
    const { data: wars } = await s.from('turf_claims').select('id, status, window_open_at, window_close_at, bar:venues(name)')
      .in('id', claimIds).in('status', ACTIVE)
    const candidates = memberIds.filter(id => id !== userId)
    const names = await nameMap(candidates)
    for (const w of (wars as any[]) ?? []) {
      const { data: cell } = await s.from('intel_cells').select('id, channel_id')
        .eq('claim_id', w.id).eq(sideType === 'org' ? 'org_id' : 'company_id', sideId).maybeSingle()
      let current: any[] = []
      if (cell) {
        const { data: mem } = await s.from('intel_cell_members').select('user_id, added_at').eq('cell_id', (cell as any).id).is('removed_at', null)
        current = ((mem as any[]) ?? []).map(m => ({ user_id: m.user_id, name: names.get(m.user_id) ?? 'Member', added_at: m.added_at }))
      }
      out.push({
        claim_id: w.id, bar: w.bar?.name ?? 'a bar', status: w.status, window_close_at: w.window_close_at,
        side_type: sideType, side_id: sideId, side_name: sideName,
        channel_id: (cell as any)?.channel_id ?? null,
        cell: current,
        candidates: candidates.map(id => ({ user_id: id, name: names.get(id) ?? 'Member' })),
      })
    }
  }

  for (const orgId of orgIds) {
    const { data: org } = await s.from('greek_orgs').select('name').eq('id', orgId).maybeSingle()
    const { data: wars } = await s.from('turf_claims').select('id').in('status', ACTIVE)
      .or(`attacking_org_id.eq.${orgId},defending_org_id.eq.${orgId}`)
    const { data: members } = await s.from('org_memberships').select('user_id').eq('org_id', orgId).eq('verified', true)
    await addSide('org', orgId, (org as any)?.name ?? 'Your org', ((wars as any[]) ?? []).map(w => w.id), ((members as any[]) ?? []).map(m => m.user_id))
  }
  for (const companyId of companyIds) {
    const { data: co } = await s.from('hessian_companies').select('name').eq('id', companyId).maybeSingle()
    const { data: contracts } = await s.from('hessian_contracts').select('claim_id').eq('company_id', companyId)
      .in('status', ['accepted', 'betrayed', 'completed'])
    const { data: members } = await s.from('hessian_members').select('user_id').eq('company_id', companyId).eq('verified', true)
    await addSide('company', companyId, (co as any)?.name ?? 'Your company', ((contracts as any[]) ?? []).map(c => c.claim_id), ((members as any[]) ?? []).map(m => m.user_id))
  }
  return ok(out)
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  if (!body.claim_id) return err('claim_id is required')
  const { data, error } = await createServiceClient().rpc('set_intel_cell', {
    p_user: userId!, p_claim: body.claim_id,
    p_org: body.org_id ?? null, p_company: body.company_id ?? null,
    p_members: Array.isArray(body.member_ids) ? body.member_ids : [],
  })
  if (error) { const e = spyError(error.message); return err(e.message, e.status) }
  return ok(data)
}
