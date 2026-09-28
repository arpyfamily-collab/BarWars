import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** Staff: the university-email gate switch, and every bar-sponsored staff account (item 11). */
async function staff(s: any, userId: string) {
  const { data } = await s.from('profiles').select('is_staff').eq('id', userId).maybeSingle()
  return !!(data as any)?.is_staff
}

export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  const [{ data: setting }, { data: sponsored }] = await Promise.all([
    s.from('app_settings').select('value, updated_at').eq('key', 'edu_gate').maybeSingle(),
    s.from('bar_sponsored_accounts').select('user_id, created_at, revoked_at, venue:venues(name), invite:bar_staff_invites(employee_name)').order('created_at', { ascending: false }),
  ])
  const rows = []
  for (const r of (sponsored as any[]) ?? []) {
    const { data: u } = await s.auth.admin.getUserById(r.user_id)
    rows.push({ ...r, email: u?.user?.email ?? null })
  }
  return ok({ gate: (setting as any)?.value ?? { enabled: false, domains: ['olemiss.edu'] }, sponsored: rows })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)
  const { data: cur } = await s.from('app_settings').select('value').eq('key', 'edu_gate').maybeSingle()
  const value = { ...((cur as any)?.value ?? { domains: ['olemiss.edu'] }), enabled: body.enabled === true }
  await s.from('app_settings').upsert({ key: 'edu_gate', value, updated_by: userId, updated_at: new Date().toISOString() })
  return ok({ gate: value })
}
