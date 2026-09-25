import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const TEST_TOKEN = 'a0000000-0000-4000-8000-000000000001'
const TEST_VENUE_ID = '875234ab-358b-4dc8-afc9-10a21c61074f'

export async function GET() {
  const service = createServiceClient()

  const { data: bracelet } = await service
    .from('bracelet_drops')
    .select(`
      id, qr_token, status, offer_value, hidden_at, found_at,
      venues:venue_id(name)
    `)
    .eq('qr_token', TEST_TOKEN)
    .maybeSingle()

  if (!bracelet) {
    return NextResponse.json({ error: 'No test bracelet found' }, { status: 404 })
  }

  return NextResponse.json({ bracelet })
}

export async function POST() {
  const service = createServiceClient()

  const now = new Date().toISOString()

  const { data: bracelet, error } = await service
    .from('bracelet_drops')
    .update({
      status: 'hidden',
      found_by: null,
      found_at: null,
      hidden_at: now,
      clue_1_released_at: now,
      clue_2_released_at: now,
      clue_3_released_at: now,
    })
    .eq('qr_token', TEST_TOKEN)
    .select(`
      id, qr_token, status, offer_value, hidden_at, found_at,
      venues:venue_id(name)
    `)
    .single()

  if (error || !bracelet) {
    return NextResponse.json({ error: 'Failed to reset test bracelet' }, { status: 500 })
  }

  return NextResponse.json({ bracelet })
}
