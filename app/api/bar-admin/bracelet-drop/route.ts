import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { venue_id, clue_1, clue_2, clue_3, offer_type, offer_value, clue_2_released_at, clue_3_released_at } = body

  if (!venue_id || !offer_type || !offer_value) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  const dropWeek = monday.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('bracelet_drops')
    .insert({
      venue_id,
      hidden_by: user.id,
      clue_1: clue_1 || null,
      clue_2: clue_2 || null,
      clue_3: clue_3 || null,
      offer_type,
      offer_value,
      drop_week: dropWeek,
      clue_1_released_at: new Date().toISOString(),
      clue_2_released_at: clue_2_released_at || null,
      clue_3_released_at: clue_3_released_at || null,
    })
    .select('id, clue_1, clue_2, clue_3, offer_type, offer_value, status, hidden_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, drop: data }, { status: 201 })
}
