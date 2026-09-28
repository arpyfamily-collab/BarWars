import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Staff moderation for Watch Link Shouts (Testing To-Do item 18).
 * GET → reported Shouts first, then the latest 50
 * POST { shout_id, action: 'remove' | 'restore' } (restore also clears reports)
 */
async function staff(s: any, userId: string) {
  const { data } = await s.from('profiles').select('is_staff').eq('id', userId).maybeSingle()
  return !!(data as any)?.is_staff
}

export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  const { data } = await s.from('war_shouts')
    .select('id, content, side, report_count, removed_at, created_at, claim:turf_claims(id, bar:venues(name))')
    .order('report_count', { ascending: false }).order('created_at', { ascending: false }).limit(50)
  return ok(((data as any[]) ?? []).map(r => ({ ...r, bar: r.claim?.bar?.name ?? null, claim_id: r.claim?.id ?? null, claim: undefined })))
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  if (!body.shout_id || !['remove', 'restore'].includes(body.action)) return err('shout_id and action are required')
  if (body.action === 'remove') {
    await s.from('war_shouts').update({ removed_at: new Date().toISOString(), removed_by: userId! }).eq('id', body.shout_id)
  } else {
    await s.from('war_shout_reports').delete().eq('shout_id', body.shout_id)
    await s.from('war_shouts').update({ removed_at: null, removed_by: null, report_count: 0 }).eq('id', body.shout_id)
  }
  return ok({ ok: true })
}
