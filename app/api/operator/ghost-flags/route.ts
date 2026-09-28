import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Staff review of flagged Ghost reports (item 12 leftover). Shows each flagged report next to the
 * war's real check-ins. "Fake" refunds every buyer in Valor, pulls the report, and suspends the
 * Ghost at 2 fakes; "Dismiss" closes the flag.
 * GET → pending flags; POST { purchase_id, action: 'fake' | 'dismiss' }
 */
async function staff(s: any, userId: string) {
  const { data } = await s.from('profiles').select('is_staff').eq('id', userId).maybeSingle()
  return !!(data as any)?.is_staff
}

export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  const { data: flags } = await s.from('ghost_report_purchases')
    .select('id, price, exclusive, flag_note, flagged_at, report:ghost_reports(id, ghost_id, observation, orgs_present, headcount_estimate, created_at, claim:turf_claims(id, status, attacker_weighted_headcount, defender_weighted_headcount, result, attacker:greek_orgs!attacking_org_id(name), defender:greek_orgs!defending_org_id(name)), bar:venues(name), ghost:ghost_profiles(codename, suspended_at))')
    .eq('flag_status', 'pending').order('flagged_at', { ascending: true }).limit(50)
  const rows = (flags as any[]) ?? []
  const records = new Map<string, any>()
  for (const g of Array.from(new Set(rows.map(r => r.report?.ghost_id).filter(Boolean)))) {
    const { data } = await s.rpc('ghost_record', { p_ghost: g }); records.set(g as string, data)
  }
  return ok(rows.map(r => ({ ...r, record: records.get(r.report?.ghost_id) ?? null })))
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('review_ghost_flag', { p_staff: userId, p_purchase: body.purchase_id, p_action: body.action })
  if (e) {
    if (e.message.includes('STAFF_ONLY')) return err('Staff only', 403)
    if (e.message.includes('NOT_PENDING')) return err('Already reviewed.', 409)
    return err('Could not review.', 500)
  }
  return ok(data)
}
