import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Public Watch Link for a Turf War (Testing To-Do item 18). No sign-in to watch.
 * The page never shows names or account IDs: Battlefield posts show only side and org.
 *
 * GET                                    → war, Battlefield, Shouts, Crowd Roar totals, signed_in
 * POST { action: 'roar', side }          → anyone, while the war is live (25 per visitor per side)
 * POST { action: 'report', shout_id }    → anyone, once per visitor
 * POST { action: 'shout', side?, content, ref?, marketing?, alerts? } → signed in, one per war
 */
const UUID = /^[0-9a-f-]{36}$/i

function visitorKey(req: NextRequest, claimId: string) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  const ua = req.headers.get('user-agent') ?? ''
  // Hashed, so no raw IP is stored
  return createHash('sha256').update(`${ip}|${ua}|${claimId}|barwars-watch`).digest('hex').slice(0, 32)
}

async function currentUser() {
  try {
    const { data } = await createServerSupabaseClient().auth.getUser()
    return data.user?.id ?? null
  } catch { return null }
}

const ERRORS: Record<string, [string, number]> = {
  WAR_NOT_ACTIVE: ['This war is over. Shouts are closed.', 409],
  WAR_NOT_LIVE: ['Roars open when the war goes live.', 409],
  BAD_LENGTH: ['Shouts are 1 to 140 characters.', 400],
  NO_LINKS: ['No links in Shouts.', 400],
  NO_PHONE: ['No phone numbers in Shouts.', 400],
  BAD_SIDE: ['Pick a side (or none).', 400],
  ALREADY_SHOUTED: ['You get one Shout per war, and you used it.', 409],
}
function mapError(raw: string | undefined) {
  for (const [code, [message, status]] of Object.entries(ERRORS)) if ((raw ?? '').includes(code)) return err(message, status)
  return err('Something went wrong. Try again.', 500)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return err('Not found', 404)
  const s = createServiceClient()
  const { data, error } = await s.rpc('watch_war', { p_claim: params.id })
  if (error || !(data as any)?.war) return err('War not found', 404)
  const userId = await currentUser()
  let shouted = false
  if (userId) {
    const { data: mine } = await s.from('war_shouts').select('id').eq('claim_id', params.id).eq('user_id', userId).maybeSingle()
    shouted = !!mine
  }
  return ok({ ...(data as any), signed_in: !!userId, shouted })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return err('Not found', 404)
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()

  if (body.action === 'roar') {
    const { data, error } = await s.rpc('roar', { p_claim: params.id, p_side: body.side, p_key: visitorKey(req, params.id) })
    if (error) return mapError(error.message)
    return ok(data)
  }

  if (body.action === 'report') {
    if (!UUID.test(String(body.shout_id ?? ''))) return err('shout_id is required')
    const userId = await currentUser()
    const { error } = await s.rpc('report_shout', { p_shout: body.shout_id, p_key: userId ? `u:${userId}` : visitorKey(req, params.id) })
    if (error) return mapError(error.message)
    return ok({ reported: true })
  }

  if (body.action === 'shout') {
    const userId = await currentUser()
    if (!userId) return err('Confirm your email to Shout.', 401)
    const { data, error } = await s.rpc('post_shout', {
      p_user: userId, p_claim: params.id, p_side: body.side || null, p_content: String(body.content ?? ''),
      p_ref: body.ref ? String(body.ref) : null, p_marketing: body.marketing === true, p_alerts: body.alerts === true,
    })
    if (error) return mapError(error.message)
    return ok({ ...(data as any), message: 'Shout posted.' }, 201)
  }

  return err('Unknown action')
}
