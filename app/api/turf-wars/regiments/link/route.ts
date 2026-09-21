import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * POST /api/turf-wars/regiments/link
 * Initiate a Link Up with another user, or respond to a pending link.
 *
 * Initiate:  { target_user_id: string }
 * Respond:   { link_id: string, action: 'accept' | 'decline' }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Respond to existing link ──────────────────────────────────────────────
  if (body.link_id) {
    const { data: link, error: fetchErr } = await service
      .from('regiment_links')
      .select('id, user_a, user_b, status, initiator')
      .eq('id', body.link_id)
      .maybeSingle()

    if (fetchErr) return err(fetchErr.message, 500)
    if (!link) return err('Link not found', 404)

    const l = link as any
    if (l.status !== 'pending') return err(`Link is already ${l.status}`, 409)

    // The non-initiator must respond
    const isRecipient = l.initiator !== userId && (l.user_a === userId || l.user_b === userId)
    if (!isRecipient) return err('Only the recipient can respond to this link', 403)

    if (body.action === 'accept') {
      const { data, error } = await service
        .from('regiment_links')
        .update({ status: 'linked', linked_at: new Date().toISOString() })
        .eq('id', body.link_id)
        .select('id, status')
        .single()
      if (error) return err(error.message, 500)
      return ok(data)
    }

    if (body.action === 'decline') {
      const { data, error } = await service
        .from('regiment_links')
        .update({ status: 'declined' })
        .eq('id', body.link_id)
        .select('id, status')
        .single()
      if (error) return err(error.message, 500)
      return ok(data)
    }

    return err('Invalid action')
  }

  // ─── Initiate new link ─────────────────────────────────────────────────────
  if (!body.target_user_id) return err('target_user_id is required')
  if (body.target_user_id === userId) return err('Cannot link with yourself', 422)

  // Check if a link already exists between these two users
  const { data: existing } = await service
    .from('regiment_links')
    .select('id, status')
    .or(`and(user_a.eq.${userId},user_b.eq.${body.target_user_id}),and(user_a.eq.${body.target_user_id},user_b.eq.${userId})`)
    .maybeSingle()

  if (existing) {
    const st = (existing as any).status
    if (st === 'linked') return err('You are already linked', 409)
    if (st === 'pending') return err('A link request is already pending', 409)
    // declined — allow re-initiation
    await service
      .from('regiment_links')
      .delete()
      .eq('id', (existing as any).id)
  }

  // Ensure both users have finder profiles
  const { data: targetProfile } = await service
    .from('regiment_finder_profiles')
    .select('is_looking')
    .eq('user_id', body.target_user_id)
    .maybeSingle()

  if (!targetProfile) return err('That user has not set up a finder profile', 404)
  if (!(targetProfile as any).is_looking) return err('That user is not currently looking for connections', 422)

  const { data, error } = await service
    .from('regiment_links')
    .insert({
      user_a: userId!,
      user_b: body.target_user_id,
      status: 'pending',
      initiator: userId!,
    })
    .select('id, status')
    .single()

  if (error) {
    if (error.code === '23505') return err('A link already exists between you two', 409)
    return err(error.message, 500)
  }

  return ok({ ...data, message: 'Link Up request sent' }, 201)
}

/**
 * GET /api/turf-wars/regiments/link
 * Returns the caller's links (pending incoming, pending outgoing, linked).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data, error } = await service
    .from('regiment_links')
    .select('id, user_a, user_b, status, initiator, created_at, linked_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)

  const links = (data as any[]) ?? []
  const incoming = links.filter(l => l.initiator !== userId && l.status === 'pending')
  const outgoing = links.filter(l => l.initiator === userId && l.status === 'pending')
  const linked = links.filter(l => l.status === 'linked')

  return ok({ incoming, outgoing, linked })
}
