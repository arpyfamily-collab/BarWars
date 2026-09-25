import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

  const names = ['Jake M.', 'Tyler R.', 'Brett K.', 'Hunter S.', 'Will D.', 'Carson P.',
    'Riley J.', 'Cole B.', 'Mason F.', 'Ethan W.', 'Grace L.', 'Anna K.',
    'Sophie T.', 'Emma R.', 'Olivia M.', 'Sarah H.', 'Drew V.', 'Luke A.',
    'Sam W.', 'Pat G.']

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
      user_id: `mock-${i}`,
      display_name: names[i] ?? 'Anonymous Soldier',
      lat: pos.lat,
      lng: pos.lng,
      skin_name: skin.name,
      skin_category: skin.category,
      skin_icon_url: null,
      skin_rarity: skin.rarity,
      status: pos.status,
      is_deception: false,
      updated_at: new Date().toISOString(),
    }
  })
}

export async function GET() {
  const supabase = createServiceClient()

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Query user_skin_loadout for users in the war zone with recent location
  const { data, error } = await supabase
    .from('user_skin_loadout')
    .select(`
      user_id,
      current_status,
      last_location_lat,
      last_location_lng,
      last_location_at,
      updated_at,
      active_skin_id,
      squad_skin_id,
      deception_skin_id,
      status_skin_id,
      profiles:user_id(full_name),
      active_skin:active_skin_id(name, category, icon_url, rarity),
      squad_skin:squad_skin_id(name, category, icon_url, rarity),
      deception_skin:deception_skin_id(name, category, icon_url, rarity),
      status_skin:status_skin_id(name, category, icon_url, rarity)
    `)
    .eq('in_war_zone', true)
    .gte('last_location_at', thirtyMinAgo)
    .not('last_location_lat', 'is', null)
    .not('last_location_lng', 'is', null)

  if (error) {
    // Fall back to mock data on error
    return NextResponse.json(generateMockRadar())
  }

  const rows = data as any[]

  if (!rows || rows.length === 0) {
    // No real users with locations — return mock data for demo
    return NextResponse.json(generateMockRadar())
  }

  const radarUsers: RadarUser[] = rows.map(row => {
    // Determine which skin is active — deception overrides squad in the war zone
    const activeSkin = row.deception_skin || row.squad_skin || row.active_skin || row.status_skin

    // Privacy: first name + last initial, or "Anonymous Soldier"
    const fullName = row.profiles?.full_name as string | undefined
    let displayName = 'Deleted user'
    if (fullName) {
      const parts = fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        displayName = `${parts[0]} ${parts[parts.length - 1][0]}.`
      } else {
        displayName = parts[0]
      }
    }

    return {
      user_id: row.user_id,
      display_name: displayName,
      lat: parseFloat(row.last_location_lat),
      lng: parseFloat(row.last_location_lng),
      skin_name: activeSkin?.name ?? 'Unknown',
      skin_category: activeSkin?.category ?? 'status',
      skin_icon_url: activeSkin?.icon_url ?? null,
      skin_rarity: activeSkin?.rarity ?? 'common',
      status: row.current_status,
      is_deception: false, // Never reveal deception — that's for Mole Scanner only
      updated_at: row.updated_at,
    }
  })

  return NextResponse.json(radarUsers)
}
