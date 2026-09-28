import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Staff: bar-sponsored skins (Testing To-Do item 21). Players unlock one by checking in at the
 * sponsoring bar during a live war there. Never sold, so Apple's in-app purchase rules don't apply.
 * GET → sponsored skins + bars
 * POST { action: 'create', name, description, venue_id, rarity, icon_url?, max_supply?, days? }
 * POST { action: 'toggle', skin_id, active }
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
  const [{ data: skins }, { data: venues }] = await Promise.all([
    s.from('skins').select('id, name, description, rarity, max_supply, sold_count, available_until, active, venue:venues!sponsor_venue_id(name)')
      .not('sponsor_venue_id', 'is', null).order('created_at', { ascending: false }),
    s.from('venues').select('id, name').order('name'),
  ])
  return ok({ skins: skins ?? [], venues: venues ?? [] })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const s = createServiceClient()
  if (!(await staff(s, userId!))) return err('Staff only', 403)

  if (body.action === 'toggle') {
    const { error: e } = await s.from('skins').update({ active: body.active === true }).eq('id', body.skin_id).not('sponsor_venue_id', 'is', null)
    if (e) return err('Could not update.', 500)
    return ok({ ok: true })
  }

  if (body.action === 'create') {
    const name = String(body.name ?? '').trim()
    if (name.length < 3 || name.length > 60) return err('Name is 3 to 60 characters.')
    if (!body.venue_id) return err('Pick the sponsoring bar.')
    const rarity = ['common', 'rare', 'epic', 'legendary'].includes(body.rarity) ? body.rarity : 'rare'
    const supply = body.max_supply ? Math.max(1, Math.round(Number(body.max_supply))) : null
    const days = Math.min(365, Math.max(1, Math.round(Number(body.days) || 90)))
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error: e } = await s.from('skins').insert({
      name, slug, description: String(body.description ?? '').slice(0, 200) || `Won in battle at the sponsoring bar.`,
      category: 'earned', rarity, icon_url: body.icon_url || null, price_cents: null,
      sponsor_venue_id: body.venue_id, max_supply: supply,
      available_from: new Date().toISOString(), available_until: new Date(Date.now() + days * 86400000).toISOString(), active: true,
    }).select('id, name').single()
    if (e) return err(`Could not create the skin: ${e.message}`, 500)
    return ok({ skin: data }, 201)
  }
  return err('Unknown action')
}
