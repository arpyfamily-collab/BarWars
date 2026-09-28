import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'
import { requireBarAdmin } from '@/lib/bar-admin'

export const dynamic = 'force-dynamic'

/**
 * Bar Command Center → staff spies (item 11). A bar invites a named employee privately: a single-use
 * link, good for 72 hours, 3 per bar per semester. The employee can be a Ghost, spy or support
 * mercenary without a university email; never a Greek or Hessian member, never a war check-in.
 * Also door staff (kind 'door'): scan-only accounts for Door Mode, no cap.
 * GET ?venue_id=; POST { venue_id, action: 'create', name, kind? } | { venue_id, action: 'revoke', invite_id }
 */
export async function GET(req: NextRequest) {
  const venueId = new URL(req.url).searchParams.get('venue_id')
  const { error } = await requireBarAdmin(venueId)
  if (error) return error
  const { data } = await createServiceClient().from('bar_staff_invites')
    .select('id, employee_name, expires_at, used_at, revoked_at, created_at, kind').eq('venue_id', venueId!).order('created_at', { ascending: false }).limit(20)
  return ok({ invites: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { userId, error } = await requireBarAdmin(body.venue_id)
  if (error) return error
  const s = createServiceClient()
  if (body.action === 'create') {
    const name = String(body.name ?? '').trim()
    if (name.length < 2 || name.length > 60) return err("Enter the employee's name.")
    const token = randomBytes(18).toString('base64url')
    const kind = body.kind === 'door' ? 'door' : 'staff_spy'
    const { data, error: e } = await s.rpc('create_staff_invite', { p_user: userId, p_venue: body.venue_id, p_name: name, p_token: token, p_kind: kind })
    if (e) return err(e.message.includes('INVITE_CAP') ? 'Your bar has used its 3 staff invites this semester.' : 'Could not create the invite.', e.message.includes('INVITE_CAP') ? 409 : 500)
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://app.barwars.app'
    return ok({ link: `${origin}/join/b/${token}`, left: (data as any).left })
  }
  if (body.action === 'revoke') {
    const { error: e } = await s.rpc('revoke_staff_invite', { p_user: userId, p_invite: body.invite_id })
    if (e) return err('Could not revoke.', 500)
    return ok({ ok: true })
  }
  return err('Unknown action')
}
