import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { spyError } from '@/lib/spy-errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/intel
 * Intel the caller may read (Testing To-Do item 12): their own reports as a mole (always), and,
 * while a war is on, reports to a side they lead or whose intel cell they joined before the
 * report was filed. Never includes who filed a report.
 * ?claim_id=xxx filters to one war. ?options=1 returns the wars the caller can report on.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const { searchParams } = new URL(req.url)
  const service = createServiceClient()

  if (searchParams.get('options')) {
    // Each active spy record: the wars its handler is in, and how many reports are left
    const { data: assets } = await service
      .from('spy_assets').select('id, handler_type, handler_org_id, handler_company_id, created_at')
      .eq('asset_user_id', userId!).eq('is_active', true).eq('burned', false)
    const out: any[] = []
    for (const a of (assets as any[]) ?? []) {
      let claimIds: string[] = []
      if (a.handler_org_id) {
        const { data } = await service.from('turf_claims').select('id')
          .in('status', ['pending', 'operator_pending', 'live', 'contested'])
          .or(`attacking_org_id.eq.${a.handler_org_id},defending_org_id.eq.${a.handler_org_id}`)
        claimIds = ((data as any[]) ?? []).map(c => c.id)
      } else if (a.handler_company_id) {
        const { data } = await service.from('hessian_contracts').select('claim_id')
          .eq('company_id', a.handler_company_id).in('status', ['accepted', 'betrayed', 'completed'])
        const ids = ((data as any[]) ?? []).map(c => c.claim_id)
        if (ids.length) {
          const { data: live } = await service.from('turf_claims').select('id').in('id', ids)
            .in('status', ['pending', 'operator_pending', 'live', 'contested'])
          claimIds = ((live as any[]) ?? []).map(c => c.id)
        }
      }
      if (claimIds.length === 0) continue
      const { data: wars } = await service.from('turf_claims')
        .select('id, window_open_at, window_close_at, bar:venues(name)').in('id', claimIds)
      const { data: filed } = await service.from('spy_intel').select('claim_id').eq('asset_id', a.id).in('claim_id', claimIds)
      for (const w of (wars as any[]) ?? []) {
        const used = ((filed as any[]) ?? []).filter(f => f.claim_id === w.id).length
        out.push({
          asset_id: a.id,
          handler: a.handler_type === 'hessian_company' ? 'Hessian company' : 'Greek org',
          recruited: a.created_at,
          claim_id: w.id,
          bar: w.bar?.name ?? 'a bar',
          window_open_at: w.window_open_at,
          window_close_at: w.window_close_at,
          reports_left: Math.max(0, 3 - used),
        })
      }
    }
    return ok(out)
  }

  const { data, error } = await service.rpc('readable_intel', { p_user: userId! })
  if (error) return err('Could not load intel. Try again.', 500)
  const claimId = searchParams.get('claim_id')
  return ok(((data as any[]) ?? []).filter(r => !claimId || r.claim_id === claimId))
}

/**
 * POST /api/turf-wars/spies/intel  { asset_id?, claim_id, intel_type, content }
 * A mole files a report for one war (3 per spy per war, only while the war is on).
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  if (!body.claim_id) return err('Pick the war this report is about')
  const service = createServiceClient()

  let assetId = body.asset_id
  if (!assetId) {
    const { data: mine } = await service.from('spy_assets').select('id')
      .eq('asset_user_id', userId!).eq('is_active', true).eq('burned', false)
    const rows = (mine as any[]) ?? []
    if (rows.length === 0) return err('You are not an active spy asset', 403)
    if (rows.length > 1) return err('You report to more than one handler. Pick which one gets this report.', 422)
    assetId = rows[0].id
  }

  const { data, error } = await service.rpc('file_spy_intel', {
    p_user: userId!, p_asset: assetId, p_claim: body.claim_id, p_type: body.intel_type, p_content: body.content,
  })
  if (error) { const e = spyError(error.message); return err(e.message, e.status) }
  const left = (data as any)?.reports_left ?? 0
  return ok({ ...(data as any), message: `Intel delivered to your handler's intel cell. ${left} report${left === 1 ? '' : 's'} left for this war.` }, 201)
}
