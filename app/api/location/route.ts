import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * War Map location (Testing To-Do item 5). Privacy rules:
 *  - opt-in only ("Show me on the War Map")
 *  - raw coordinates are never stored: the server keeps only which participating bar the
 *    player is within ZONE_M of, and when
 *  - the map (api/radar/live) places players at that bar with a small fixed offset, no names
 *
 * GET                        → { enabled, at_bar, updated_at }
 * POST { enabled: boolean }  → turn sharing on/off (off clears the player from the map at once)
 * POST { lat, lng, accuracy }→ position report while the app is open (every few minutes)
 * POST { place_venue_id }    → testers only (item 6): show me at this bar for up to 3 hours,
 *                              ignoring real GPS; place_venue_id: null ends it
 */
const PLACE_HOURS = 3
const ZONE_M = 60           // within 60 m of a participating bar = in the war zone
const MAX_ACCURACY_M = 150  // ignore fixes worse than this
const MIN_INTERVAL_MS = 45_000

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function loadout(service: any, userId: string) {
  const { data } = await service
    .from('user_skin_loadout')
    .select('user_id, share_location, in_war_zone, at_venue_id, last_location_at, virtual_until, venue:venues!user_skin_loadout_at_venue_id_fkey(name)')
    .eq('user_id', userId)
    .maybeSingle()
  return data as any
}

async function ensureLoadout(service: any, userId: string) {
  const row = await loadout(service, userId)
  if (row) return row
  await service.from('user_skin_loadout').insert({ user_id: userId, current_status: 'idle', status_set_at: new Date().toISOString() })
  return await loadout(service, userId)
}

const placed = (row: any) => !!row?.virtual_until && new Date(row.virtual_until).getTime() > Date.now()

async function isTester(service: any, userId: string) {
  const { data } = await service.from('profiles').select('is_tester').eq('id', userId).maybeSingle()
  return !!(data as any)?.is_tester
}

export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const service = createServiceClient()
  const row = await loadout(service, userId!)
  const fresh = row?.last_location_at && Date.now() - new Date(row.last_location_at).getTime() < 20 * 60_000
  const tester = await isTester(service, userId!)
  let bars: any[] = []
  if (tester) {
    const { data } = await service.from('venues').select('id, name').eq('turf_enabled', true).not('lat', 'is', null).order('name')
    bars = (data as any[]) ?? []
  }
  return ok({
    enabled: !!row?.share_location,
    at_bar: row?.share_location && row?.in_war_zone && fresh ? row?.venue?.name ?? null : null,
    updated_at: row?.last_location_at ?? null,
    tester,
    placed: tester && placed(row) ? { venue_id: row.at_venue_id, bar: row.venue?.name ?? null, until: row.virtual_until } : null,
    bars,
  })
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const service = createServiceClient()

  // Turn sharing on or off
  if (typeof body.enabled === 'boolean') {
    await ensureLoadout(service, userId!)
    const patch: any = { share_location: body.enabled, updated_at: new Date().toISOString() }
    if (!body.enabled) Object.assign(patch, { in_war_zone: false, at_venue_id: null, last_location_at: null, virtual_until: null })
    const { error } = await service.from('user_skin_loadout').update(patch).eq('user_id', userId!)
    if (error) return err('Could not save that. Try again.', 500)
    return ok({ enabled: body.enabled })
  }

  // Tester placement (item 6)
  if ('place_venue_id' in body) {
    if (!(await isTester(service, userId!))) return err('Testers only', 403)
    await ensureLoadout(service, userId!)
    const now = new Date()
    if (!body.place_venue_id) {
      await service.from('user_skin_loadout').update({ virtual_until: null, in_war_zone: false, at_venue_id: null, last_location_at: null, updated_at: now.toISOString() }).eq('user_id', userId!)
      return ok({ placed: null })
    }
    const { data: bar } = await service.from('venues').select('id, name').eq('id', body.place_venue_id).eq('turf_enabled', true).maybeSingle()
    if (!bar) return err('Pick a participating bar', 404)
    const until = new Date(now.getTime() + PLACE_HOURS * 3600_000).toISOString()
    await service.from('user_skin_loadout').update({
      share_location: true, in_war_zone: true, at_venue_id: (bar as any).id,
      last_location_at: now.toISOString(), virtual_until: until, updated_at: now.toISOString(),
    }).eq('user_id', userId!)
    return ok({ placed: { venue_id: (bar as any).id, bar: (bar as any).name, until } })
  }

  // Position report
  const lat = Number(body.lat), lng = Number(body.lng), acc = Number(body.accuracy ?? 0)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err('lat and lng are required')

  const row = await ensureLoadout(service, userId!)
  if (!row?.share_location) return ok({ enabled: false, at_bar: null })
  if (placed(row) && (await isTester(service, userId!))) {
    await service.from('user_skin_loadout').update({ last_location_at: new Date().toISOString() }).eq('user_id', userId!)
    return ok({ enabled: true, at_bar: row.venue?.name ?? null, placed: true })
  }
  if (row.last_location_at && Date.now() - new Date(row.last_location_at).getTime() < MIN_INTERVAL_MS) {
    return ok({ enabled: true, at_bar: row.in_war_zone ? row.venue?.name ?? null : null, throttled: true })
  }

  let atVenue: { id: string; name: string } | null = null
  if (!(acc > MAX_ACCURACY_M)) {
    const { data: bars } = await service.from('venues').select('id, name, lat, lon').eq('turf_enabled', true).not('lat', 'is', null).not('lon', 'is', null)
    let best = Infinity
    for (const b of (bars as any[]) ?? []) {
      const d = metersBetween(lat, lng, Number(b.lat), Number(b.lon))
      if (d <= ZONE_M && d < best) { best = d; atVenue = { id: b.id, name: b.name } }
    }
  }

  const now = new Date().toISOString()
  await service.from('user_skin_loadout').update({
    in_war_zone: !!atVenue,
    at_venue_id: atVenue?.id ?? null,
    last_location_at: now,
    updated_at: now,
  }).eq('user_id', userId!)

  return ok({ enabled: true, at_bar: atVenue?.name ?? null })
}
