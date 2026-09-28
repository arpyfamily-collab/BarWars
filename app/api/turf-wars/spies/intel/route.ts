import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getHandledAssetIds } from '@/lib/spy-handlers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/intel
 * Returns intel the caller may read: reports they filed as a mole, and reports filed to a
 * side they lead (org leader or Hessian captain). Never includes who filed a report.
 * ?claim_id=xxx filters to a specific event.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const claimId = searchParams.get('claim_id')

  const service = createServiceClient()

  const { data: myAssets } = await service
    .from('spy_assets')
    .select('id')
    .eq('asset_user_id', userId!)

  const assetIds = new Set<string>(((myAssets as any[]) ?? []).map(a => a.id))
  for (const id of await getHandledAssetIds(service, userId!)) assetIds.add(id)
  if (assetIds.size === 0) return ok([])

  let query = service
    .from('spy_intel')
    .select('id, intel_type, content, claim_id, expires_at, created_at')
    .in('asset_id', Array.from(assetIds))
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (claimId) query = query.eq('claim_id', claimId)

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data ?? [])
}

/**
 * POST /api/turf-wars/spies/intel
 * Submit an intel report from a spy asset to their handler.
 * Body: { intel_type, content, claim_id? }
 * Intel expires after 24 hours.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { intel_type: string; content: string; claim_id?: string; asset_id?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.intel_type) return err('intel_type is required')
  if (!['headcount', 'shots_fired_plan', 'war_declaration_plan', 'bar_observation'].includes(body.intel_type)) {
    return err('Invalid intel_type')
  }
  if (!body.content || body.content.length < 5) return err('content is required (min 5 characters)')

  const service = createServiceClient()

  // The caller's active spy records. A double agent has one per handler and picks which
  // handler gets this report (maybeSingle used to error on two rows, so double agents couldn't file).
  const { data: assetRows, error: assetErr } = await service
    .from('spy_assets')
    .select('id, is_active, burned')
    .eq('asset_user_id', userId!)
    .eq('is_active', true)

  if (assetErr) return err('Could not load your spy status. Try again.', 500)
  const active = (assetRows as any[]) ?? []
  if (active.length === 0) return err('You are not an active spy asset', 403)

  let asset: any
  if (body.asset_id) {
    asset = active.find(a => a.id === body.asset_id)
    if (!asset) return err('That handler is not one of yours', 403)
  } else if (active.length === 1) {
    asset = active[0]
  } else {
    return err('You report to more than one handler. Pick which one gets this report.', 422)
  }
  if (asset.burned) return err('You have been burned. Your spy status is public.', 403)

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const { data, error } = await service
    .from('spy_intel')
    .insert({
      asset_id: (asset as any).id,
      claim_id: body.claim_id ?? null,
      intel_type: body.intel_type,
      content: body.content,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, intel_type, expires_at')
    .single()

  if (error) return err(error.message, 500)

  return ok({ ...data, message: 'Intel delivered. This report expires in 24 hours.' }, 201)
}
