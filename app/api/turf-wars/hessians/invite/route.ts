import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { factionError } from '@/lib/factions'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.barwars.app'

/**
 * Hessian company invite links (Testing To-Do item 2).
 *
 * POST { company_id }            captain gets a shareable link (reuses a live one)
 * POST { code, action: 'join' }  signed-in player joins through the link
 * GET  ?code=...                 preview for the join page: company name, captain, size, still valid?
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const service = createServiceClient()

  // Join through a link
  if (body.action === 'join') {
    if (!body.code || typeof body.code !== 'string') return err('code is required')
    const { data, error } = await service.rpc('redeem_hessian_invite', { p_user: userId!, p_code: body.code })
    if (error) { const e = factionError(error.message); return err(e.message, e.status) }
    return ok(data)
  }

  // Captain creates (or reuses) a link
  if (!body.company_id) return err('company_id is required')
  const { data: company } = await service
    .from('hessian_companies').select('id, name, captain_id').eq('id', body.company_id).maybeSingle()
  if (!company) return err('Company not found', 404)
  if ((company as any).captain_id !== userId) return err('Only the captain can invite people', 403)

  const { data: live } = await service
    .from('hessian_invites')
    .select('code, expires_at, max_uses, uses_count')
    .eq('company_id', body.company_id)
    .eq('created_by', userId!)
    .is('revoked_at', null)
    .gt('expires_at', new Date(Date.now() + 24 * 3600 * 1000).toISOString())  // at least a day left
    .order('created_at', { ascending: false })
    .limit(5)
  let invite = ((live as any[]) ?? []).find(i => i.uses_count < i.max_uses)

  if (!invite) {
    const { data: created, error } = await service
      .from('hessian_invites')
      .insert({ company_id: body.company_id, created_by: userId! })
      .select('code, expires_at, max_uses, uses_count')
      .single()
    if (error) return err('Could not create an invite. Try again.', 500)
    invite = created
  }

  return ok({
    code: invite.code,
    url: `${APP_URL}/join/h/${invite.code}`,
    expires_at: invite.expires_at,
    uses_left: invite.max_uses - invite.uses_count,
    company_name: (company as any).name,
  })
}

export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return err('code is required')
  const service = createServiceClient()

  const { data: inv } = await service
    .from('hessian_invites')
    .select('company_id, created_by, expires_at, max_uses, uses_count, revoked_at, company:hessian_companies(name, captain_id, member_count, reputation_score)')
    .eq('code', code)
    .maybeSingle()
  const i: any = inv
  if (!i || !i.company) return ok({ valid: false, reason: "This invite link isn't valid anymore. Ask the captain for a new one." })

  const { data: cap } = await service.from('public_profiles').select('display_name').eq('id', i.company.captain_id).maybeSingle()
  const { data: mine } = await service.from('hessian_members').select('company_id, verified').eq('user_id', userId!).maybeSingle()

  let reason: string | null = null
  if (i.revoked_at || i.company.captain_id !== i.created_by) reason = "This invite link isn't valid anymore. Ask the captain for a new one."
  else if (new Date(i.expires_at) < new Date()) reason = 'This invite link has expired. Ask the captain for a new one.'
  else if (i.uses_count >= i.max_uses) reason = 'This invite link has been used up. Ask the captain for a new one.'

  const m: any = mine
  return ok({
    valid: !reason,
    reason,
    company_name: i.company.name,
    captain_name: (cap as any)?.display_name ?? 'The captain',
    member_count: i.company.member_count,
    reputation: i.company.reputation_score,
    already_member: !!m && m.company_id === i.company_id && m.verified,
    is_captain: i.company.captain_id === userId,
    in_other_company: !!m && m.company_id !== i.company_id,
  })
}
