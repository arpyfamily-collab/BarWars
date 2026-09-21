import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * GET /api/turf-wars/spies/intel
 * Returns intel reports visible to the caller (as spy asset or as handler).
 * ?claim_id=xxx filters to a specific event.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const claimId = searchParams.get('claim_id')

  const service = createServiceClient()

  // Get the caller's active spy assets
  const { data: myAssets } = await service
    .from('spy_assets')
    .select('id')
    .eq('asset_user_id', userId!)
    .eq('is_active', true)

  // Get assets where caller is the handler (org or company)
  const { data: orgMemberships } = await service
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId!)
    .eq('verified', true)

  const { data: myCompany } = await service
    .from('hessian_companies')
    .select('id')
    .eq('captain_id', userId!)
    .maybeSingle()

  const assetIds = ((myAssets as any[]) ?? []).map(a => a.id)
  const handlerOrgIds = ((orgMemberships as any[]) ?? []).map(m => m.org_id)
  const handlerCompanyIds = myCompany ? [(myCompany as any).id] : []

  // Fetch intel from caller's assets
  let query = service
    .from('spy_intel')
    .select(`
      id, intel_type, content, expires_at, created_at,
      asset:spy_assets(asset_user_id, spy_type, handler_type)
    `)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (claimId) {
    query = query.eq('claim_id', claimId)
  }

  // We need intel where the caller is either the asset or the handler
  const { data: allIntel, error } = await query.limit(50)

  if (error) return err(error.message, 500)

  // Filter: caller is the asset OR caller is the handler
  const filtered = ((allIntel as any[]) ?? []).filter(intel => {
    const asset = intel.asset as any
    if (!asset) return false
    // Is the caller the asset?
    if (asset.asset_user_id === userId) return true
    // Is the caller the handler org?
    if (asset.handler_type === 'org' && handlerOrgIds.length > 0) {
      // Need to check handler_org_id — but we only selected asset_user_id, spy_type, handler_type
      // Fetch handler_org_id separately
      return true // We'll refine below
    }
    // Is the caller the handler company?
    if (asset.handler_type === 'hessian_company' && handlerCompanyIds.length > 0) {
      return true
    }
    return false
  })

  // For handler-side, do a proper query with the asset's handler_org_id
  if (handlerOrgIds.length > 0 || handlerCompanyIds.length > 0) {
    const { data: handlerAssets } = await service
      .from('spy_assets')
      .select('id')
      .or(handlerOrgIds.length > 0 ? `handler_org_id.in.(${handlerOrgIds.join(',')})` : 'handler_org_id.is.null')
    // Also company assets
    if (handlerCompanyIds.length > 0) {
      const { data: companyAssets } = await service
        .from('spy_assets')
        .select('id')
        .in('handler_company_id', handlerCompanyIds)
      if (companyAssets) {
        const combinedIds = [...((handlerAssets as any[]) ?? []).map(a => a.id), ...(companyAssets as any[]).map(a => a.id)]
        const { data: handlerIntel } = await service
          .from('spy_intel')
          .select(`
            id, intel_type, content, expires_at, created_at,
            asset:spy_assets(asset_user_id, spy_type)
          `)
          .in('asset_id', combinedIds)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(50)

        if (handlerIntel) {
          const combined = [...filtered, ...(handlerIntel as any[])]
          // Deduplicate by id
          const seen = new Set<string>()
          const unique = combined.filter(i => {
            if (seen.has(i.id)) return false
            seen.add(i.id)
            return true
          })
          return ok(unique)
        }
      }
    }

    if (handlerAssets && (handlerAssets as any[]).length > 0) {
      const { data: handlerIntel } = await service
        .from('spy_intel')
        .select(`
          id, intel_type, content, expires_at, created_at,
          asset:spy_assets(asset_user_id, spy_type)
        `)
        .in('asset_id', (handlerAssets as any[]).map(a => a.id))
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50)

      if (handlerIntel) {
        const combined = [...filtered, ...(handlerIntel as any[])]
        const seen = new Set<string>()
        const unique = combined.filter(i => {
          if (seen.has(i.id)) return false
          seen.add(i.id)
          return true
        })
        return ok(unique)
      }
    }
  }

  return ok(filtered)
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

  let body: { intel_type: string; content: string; claim_id?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.intel_type) return err('intel_type is required')
  if (!['headcount', 'shots_fired_plan', 'war_declaration_plan', 'bar_observation'].includes(body.intel_type)) {
    return err('Invalid intel_type')
  }
  if (!body.content || body.content.length < 5) return err('content is required (min 5 characters)')

  const service = createServiceClient()

  // Get the caller's active spy asset
  const { data: asset, error: assetErr } = await service
    .from('spy_assets')
    .select('id, is_active, burned')
    .eq('asset_user_id', userId!)
    .eq('is_active', true)
    .maybeSingle()

  if (assetErr) return err(assetErr.message, 500)
  if (!asset) return err('You are not an active spy asset', 403)
  if ((asset as any).burned) return err('You have been burned. Your spy status is public.', 403)

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
