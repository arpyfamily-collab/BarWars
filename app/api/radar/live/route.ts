import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

interface RadarUser {
  user_id: string
  display_name: string
  lat: number
  lng: number
  skin_name: string
  skin_category: string
  skin_icon_url: string | null
  skin_rarity: string
  status: string
  is_deception: boolean
  updated_at: string
  is_me?: boolean
  demo?: boolean
}

// Oxford Square center
const SQUARE_LAT = 34.3663
const SQUARE_LNG = -89.5193

// Mock data for demo purposes — scattered around the Square
function generateMockRadar(): RadarUser[] {
  const mockSkins = [
    { name: 'Alpha House Crest', category: 'squad', rarity: 'rare' },
    { name: 'Kappa Manor Crest', category: 'squad', rarity: 'rare' },
    { name: 'Cabana Crown', category: 'squad', rarity: 'rare' },
    { name: 'Bungalow Trident', category: 'squad', rarity: 'rare' },
    { name: 'Hessian Captain', category: 'squad', rarity: 'legendary' },
    { name: 'Solo Mercenary Skull', category: 'squad', rarity: 'common' },
    { name: 'Rally Horn', category: 'status', rarity: 'common' },
    { name: 'Battle Gear', category: 'status', rarity: 'common' },
    { name: 'Scorched Earth Flame', category: 'earned', rarity: 'legendary' },
    { name: 'Veteran Shield', category: 'earned', rarity: 'legendary' },
  ]

  // Positions: cluster at "The Library" (approx), cluster at "Funky's", scattered
  const positions: Array<{ lat: number; lng: number; status: string }> = [
    // Cluster of 8 at The Library area
    { lat: 34.3670, lng: -89.5198, status: 'in_battle' },
    { lat: 34.3671, lng: -89.5197, status: 'in_battle' },
    { lat: 34.3669, lng: -89.5199, status: 'in_battle' },
    { lat: 34.3670, lng: -89.5196, status: 'in_battle' },
    { lat: 34.3671, lng: -89.5200, status: 'in_battle' },
    { lat: 34.3668, lng: -89.5198, status: 'in_battle' },
    { lat: 34.3672, lng: -89.5199, status: 'in_battle' },
    { lat: 34.3669, lng: -89.5195, status: 'in_battle' },
    // Cluster of 5 at Funky's area
    { lat: 34.3658, lng: -89.5178, status: 'in_battle' },
    { lat: 34.3659, lng: -89.5179, status: 'in_battle' },
    { lat: 34.3657, lng: -89.5177, status: 'in_battle' },
    { lat: 34.3658, lng: -89.5180, status: 'in_battle' },
    { lat: 34.3659, lng: -89.5178, status: 'in_battle' },
    // Scattered individuals between venues
    { lat: 34.3662, lng: -89.5188, status: 'spectating' },
    { lat: 34.3665, lng: -89.5192, status: 'spectating' },
    { lat: 34.3660, lng: -89.5195, status: 'in_battle' },
    // 3 rallying — moving toward the Square from different directions
    { lat: 34.3678, lng: -89.5205, status: 'rallying' },
    { lat: 34.3652, lng: -89.5185, status: 'rallying' },
    { lat: 34.3670, lng: -89.5212, status: 'rallying' },
  ]

  return positions.map((pos, i) => {
    const skin = mockSkins[i % mockSkins.length]
    return {
      user_id: `demo-${i}`,
      display_name: 'Demo player',
      lat: pos.lat,
      lng: pos.lng,
      skin_name: skin.name,
      skin_category: skin.category,
      skin_icon_url: null,
      skin_rarity: skin.rarity,
      status: pos.status,
      is_deception: false,
      updated_at: new Date().toISOString(),
      demo: true,
    }
  })
}

const WAR_STATUSES = new Set(['in_battle', 'rallying', 'spectating'])

// Stable per player per day, so a dot doesn't jump around, but can't be tied to an account
function dayHash(userId: string) {
  return createHash('sha256').update(`${userId}:${new Date().toISOString().slice(0, 10)}:barwars-radar`).digest()
}

/**
 * GET /api/radar/live — players on the War Map (Testing To-Do item 5).
 * Signed-in only. Only players who opted in and reported from a participating bar in the last
 * 20 minutes. Each is placed at that bar with a fixed small offset (8-25 m); no names, no account
 * IDs, no raw coordinates ever leave the server. Demo dots only when nobody real is out.
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('user_skin_loadout')
    .select(`
      user_id, current_status, updated_at, last_location_at,
      venue:venues!user_skin_loadout_at_venue_id_fkey(lat, lon),
      active_skin:active_skin_id(name, category, icon_url, rarity),
      squad_skin:squad_skin_id(name, category, icon_url, rarity),
      deception_skin:deception_skin_id(name, category, icon_url, rarity),
      status_skin:status_skin_id(name, category, icon_url, rarity)
    `)
    .eq('share_location', true)
    .eq('in_war_zone', true)
    .not('at_venue_id', 'is', null)
    .gte('last_location_at', since)

  const rows = ((data as any[]) ?? []).filter(r => r.venue?.lat != null && r.venue?.lon != null)
  if (error || rows.length === 0) return NextResponse.json(generateMockRadar())

  const radarUsers: RadarUser[] = rows.map(row => {
    // Deception overrides squad in the war zone (never revealed as deception here)
    const skin = row.deception_skin || row.squad_skin || row.active_skin || row.status_skin
    const h = dayHash(row.user_id)
    const angle = (h.readUInt16BE(0) / 65535) * 2 * Math.PI
    const meters = 8 + (h[2] / 255) * 17
    const lat = Number(row.venue.lat) + (meters * Math.cos(angle)) / 111320
    const lng = Number(row.venue.lon) + (meters * Math.sin(angle)) / (111320 * Math.cos((Number(row.venue.lat) * Math.PI) / 180))
    const isMe = row.user_id === userId
    return {
      user_id: isMe ? 'me' : h.subarray(4, 12).toString('hex'),
      display_name: isMe ? 'You' : 'Soldier',
      lat, lng,
      skin_name: skin?.name ?? 'Unknown',
      skin_category: skin?.category ?? 'status',
      skin_icon_url: skin?.icon_url ?? null,
      skin_rarity: skin?.rarity ?? 'common',
      status: WAR_STATUSES.has(row.current_status) ? row.current_status : 'spectating',
      is_deception: false,
      updated_at: row.last_location_at,
      is_me: isMe,
    }
  })

  return NextResponse.json(radarUsers)
}
