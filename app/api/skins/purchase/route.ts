import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { skin_id } = body

  if (!skin_id || typeof skin_id !== 'string') {
    return NextResponse.json({ error: 'Missing skin_id' }, { status: 400 })
  }

  // Look up the skin
  const { data: skin, error: skinError } = await supabase
    .from('skins')
    .select('id, name, category, price_cents, rental_only, rental_hours, active, requires_badge, requires_role')
    .eq('id', skin_id)
    .maybeSingle()

  if (skinError || !skin) {
    return NextResponse.json({ error: 'Skin not found' }, { status: 404 })
  }

  if (!skin.active) {
    return NextResponse.json({ error: 'This skin is no longer available' }, { status: 400 })
  }

  // Check if already owned (non-rental)
  if (!skin.rental_only) {
    const { data: existing } = await supabase
      .from('user_skins')
      .select('id')
      .eq('user_id', user.id)
      .eq('skin_id', skin_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'You already own this skin' }, { status: 409 })
    }
  }

  // Check if already has an active rental
  if (skin.rental_only) {
    const { data: activeRental } = await supabase
      .from('user_skins')
      .select('id, rental_expires_at')
      .eq('user_id', user.id)
      .eq('skin_id', skin_id)
      .gt('rental_expires_at', new Date().toISOString())
      .maybeSingle()

    if (activeRental) {
      return NextResponse.json({ error: 'You already have an active rental for this skin' }, { status: 409 })
    }
  }

  // Check requirements for earned skins
  if (skin.requires_badge) {
    const { data: badge } = await supabase
      .from('veteran_badges')
      .select('id')
      .eq('user_id', user.id)
      .eq('badge_name', skin.requires_badge)
      .limit(1)
      .maybeSingle()

    if (!badge) {
      return NextResponse.json({ error: 'You have not earned the required badge for this skin' }, { status: 403 })
    }
  }

  // For free skins (price_cents is null or 0), grant directly
  const isFree = !skin.price_cents || skin.price_cents === 0

  if (isFree) {
    const rentalExpiresAt = skin.rental_only && skin.rental_hours
      ? new Date(Date.now() + skin.rental_hours * 60 * 60 * 1000).toISOString()
      : null

    // Players can't write user_skins directly; the server grants after the checks above
    const service = createServiceClient()
    const { data: userSkin, error: insertError } = await service
      .from('user_skins')
      .insert({
        user_id: user.id,
        skin_id: skin.id,
        ownership_type: skin.rental_only ? 'rented' : 'earned',
        rental_expires_at: rentalExpiresAt,
        amount_paid: 0,
      })
      .select('id, skin_id, ownership_type, rental_expires_at, equipped')
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Could not add this skin. Try again.' }, { status: 500 })
    }

    await service.rpc('increment_skin_sold_count', { p_skin_id: skin.id })
    return NextResponse.json({ success: true, user_skin: userSkin }, { status: 201 })
  }

  // Paid skins: sold only through Apple in-app purchase (App Store Guideline 3.1.1), which isn't
  // built yet. This used to "simulate" the purchase and hand the skin over for free.
  return NextResponse.json({ error: 'Paid skins are coming soon through the App Store.' }, { status: 402 })
}
