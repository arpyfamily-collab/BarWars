import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Staff: the barwars.app waitlist ("Join the Waitlist" / "Enlist Now").
 * GET → count + newest 25;  GET ?format=csv → every signup as a CSV download
 */
export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const { data: me } = await s.from('profiles').select('is_staff').eq('id', userId!).maybeSingle()
  if (!(me as any)?.is_staff) return err('Staff only', 403)

  if (new URL(req.url).searchParams.get('format') === 'csv') {
    const rows: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await s.from('waitlist').select('email, source, campus, created_at').order('created_at').range(from, from + 999)
      rows.push(...((data as any[]) ?? []))
      if (!data || data.length < 1000) break
    }
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = ['email,source,campus,signed_up_at', ...rows.map(r => [r.email, r.source, r.campus, r.created_at].map(esc).join(','))].join('\n')
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="barwars-waitlist-${new Date().toISOString().slice(0, 10)}.csv"` } })
  }

  const [{ count }, { data: recent }] = await Promise.all([
    s.from('waitlist').select('id', { count: 'exact', head: true }),
    s.from('waitlist').select('email, source, created_at').order('created_at', { ascending: false }).limit(25),
  ])
  return ok({ count: count ?? 0, recent: recent ?? [] })
}
