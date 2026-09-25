import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

const VALID_TYPES = ['daily_dropper', 'weekly_over_under', 'season_most_drops'] as const
type PredictionType = typeof VALID_TYPES[number]

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { prediction_type, target_venue_id, guess_value, prediction_date } = body

  if (!prediction_type || !VALID_TYPES.includes(prediction_type as PredictionType)) {
    return NextResponse.json({ error: 'Invalid prediction type' }, { status: 400 })
  }

  if (!prediction_date || typeof prediction_date !== 'string') {
    return NextResponse.json({ error: 'Missing prediction_date' }, { status: 400 })
  }

  const type = prediction_type as PredictionType

  if ((type === 'daily_dropper' || type === 'season_most_drops') && !target_venue_id) {
    return NextResponse.json({ error: 'Missing target_venue_id' }, { status: 400 })
  }

  if (type === 'weekly_over_under' && !['over', 'under'].includes(guess_value)) {
    return NextResponse.json({ error: 'guess_value must be "over" or "under"' }, { status: 400 })
  }

  // Check for duplicate submission
  const { data: existing } = await supabase
    .from('predictions')
    .select('id')
    .eq('user_id', user.id)
    .eq('prediction_type', type)
    .eq('prediction_date', prediction_date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already submitted a prediction for this type today.' },
      { status: 409 }
    )
  }

  // Season futures: check if user already has an active season prediction (any date)
  if (type === 'season_most_drops') {
    const { data: seasonExisting } = await supabase
      .from('predictions')
      .select('id')
      .eq('user_id', user.id)
      .eq('prediction_type', 'season_most_drops')
      .is('result', null)
      .maybeSingle()

    if (seasonExisting) {
      return NextResponse.json(
        { error: 'You already have an active season futures prediction.' },
        { status: 409 }
      )
    }
  }

  const { data: prediction, error } = await supabase
    .from('predictions')
    .insert({
      user_id: user.id,
      prediction_type: type,
      target_venue_id: target_venue_id ?? null,
      guess_value: guess_value ?? null,
      prediction_date,
    })
    .select('id, prediction_type, target_venue_id, guess_value, prediction_date, result, payout_bonds, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'You already submitted a prediction for this type today.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ prediction }, { status: 201 })
}
