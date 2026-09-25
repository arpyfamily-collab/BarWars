import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { venue_id, special_name, description, run_date, start_time, end_time } = body

  if (!venue_id || !special_name || !description || !run_date || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  const weekStart = monday.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('war_specials')
    .insert({
      venue_id,
      submitted_by: user.id,
      special_name,
      description,
      run_date,
      start_time,
      end_time,
      week_start: weekStart,
    })
    .select('id, special_name, description, run_date, start_time, end_time, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, special: data }, { status: 201 })
}
