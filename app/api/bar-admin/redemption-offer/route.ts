import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { venue_id, name, description, valor_cost, max_per_night } = body

  if (!venue_id || !name || !valor_cost) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('war_bond_redemption_offers')
    .insert({
      venue_id,
      name,
      description: description || null,
      valor_cost,
      max_per_night: max_per_night ?? null,
    })
    .select('id, name, description, valor_cost, max_per_night, claimed_count, active')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, offer: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { offer_id, active } = body

  if (!offer_id || typeof active !== 'boolean') {
    return NextResponse.json({ error: 'Missing offer_id or active' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('war_bond_redemption_offers')
    .update({ active })
    .eq('id', offer_id)
    .select('id, active')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, offer: data })
}
