import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { ok, err } from '@/lib/challenges'
import { requireBarAdmin } from '@/lib/bar-admin'

export const dynamic = 'force-dynamic'

/**
 * Battle Plans for a bar (Testing To-Do item 19): set once, fire automatically when a real war happens.
 * GET ?venue_id=                               → plans, recent firings, armed-for-tonight flag
 * POST { venue_id, action: 'create', offer_text, details?, is_drink, scope, cap, nights[], days }
 * POST { venue_id, action: 'pause' | 'resume' | 'delete', plan_id }
 * POST { venue_id, action: 'line', on }       → optional dedicated BarWars line (item 22)
 * POST { venue_id, action: 'redeem', code }    → staff verify a player's code at the door
 */
export async function GET(req: NextRequest) {
  const venueId = new URL(req.url).searchParams.get('venue_id')
  const { error } = await requireBarAdmin(venueId)
  if (error) return error
  const s = createServiceClient()
  const [{ data: plans }, { data: firings }, { data: night }] = await Promise.all([
    s.from('battle_plans').select('*').eq('venue_id', venueId!).order('created_at', { ascending: false }),
    s.from('battle_plan_firings').select('id, night, fired_at, claimed_count, redeemed_count, plan:battle_plans(offer_text, cap), claim:turf_claims(id, bar:venues(name))')
      .eq('venue_id', venueId!).order('fired_at', { ascending: false }).limit(20),
    s.rpc('bar_night'),
  ])
  const { data: venue } = await s.from('venues').select('barwars_line').eq('id', venueId!).maybeSingle()
  const dow = night ? new Date(`${night}T12:00:00Z`).getUTCDay() : new Date().getDay()
  const now = Date.now()
  const armedTonight = ((plans as any[]) ?? []).filter(p => !p.paused && new Date(p.expires_at).getTime() > now && (p.nights ?? []).includes(dow))
  return ok({
    plans: plans ?? [],
    firings: ((firings as any[]) ?? []).map(f => ({ ...f, war_bar: f.claim?.bar?.name ?? null, claim: undefined })),
    barwars_line: !!(venue as any)?.barwars_line,
    tonight: night, armed_tonight: armedTonight.length, fired_tonight: ((firings as any[]) ?? []).some(f => f.night === night),
  })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { userId, error } = await requireBarAdmin(body.venue_id)
  if (error) return error
  const s = createServiceClient()

  if (body.action === 'create') {
    const offer = String(body.offer_text ?? '').trim()
    if (offer.length < 3 || offer.length > 120) return err('The offer is 3 to 120 characters.')
    const nights = Array.isArray(body.nights) ? Array.from(new Set(body.nights.map(Number).filter((n: number) => n >= 0 && n <= 6))) : []
    if (!nights.length) return err('Pick at least one night.')
    const cap = Math.round(Number(body.cap) || 50)
    if (cap < 1 || cap > 500) return err('The cap is 1 to 500 people.')
    const days = Math.min(60, Math.max(1, Math.round(Number(body.days) || 30)))
    const { data, error: e } = await s.from('battle_plans').insert({
      venue_id: body.venue_id, created_by: userId, offer_text: offer, details: body.details ? String(body.details).slice(0, 300) : null,
      is_drink: body.is_drink === true, scope: body.scope === 'any_war' ? 'any_war' : 'my_bar', cap, nights,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    }).select('*').single()
    if (e) return err('Could not save the Battle Plan.', 500)
    return ok({ plan: data, message: 'Battle Plan armed.' }, 201)
  }

  if (['pause', 'resume', 'delete'].includes(body.action)) {
    const q = body.action === 'delete'
      ? s.from('battle_plans').delete()
      : s.from('battle_plans').update({ paused: body.action === 'pause' })
    const { error: e } = await q.eq('id', body.plan_id).eq('venue_id', body.venue_id)
    if (e) return err('Could not update the Battle Plan.', 500)
    return ok({ ok: true })
  }

  // Optional perk (item 22): the bar runs a dedicated BarWars line. Never required.
  if (body.action === 'line') {
    const { error: e } = await s.from('venues').update({ barwars_line: body.on === true }).eq('id', body.venue_id)
    if (e) return err('Could not update.', 500)
    return ok({ barwars_line: body.on === true })
  }

  if (body.action === 'redeem') {
    const { data, error: e } = await s.rpc('redeem_battle_plan', { p_user: userId, p_venue: body.venue_id, p_code: String(body.code ?? '') })
    if (e) {
      if (e.message.includes('CODE_NOT_FOUND')) return err('No Battle Plan code like that tonight at this bar.', 404)
      if (e.message.includes('ALREADY_REDEEMED')) return err('That code was already used.', 409)
      return err('Could not redeem.', 500)
    }
    return ok({ ...(data as any), message: (data as any).is_drink ? 'Valid. Drink offer: check ID (21+).' : 'Valid.' })
  }

  return err('Unknown action')
}
