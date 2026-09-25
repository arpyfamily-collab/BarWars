import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { skin_id, layer } = body

  if (!skin_id || !layer) {
    return NextResponse.json({ error: 'Missing skin_id or layer' }, { status: 400 })
  }

  // Verify the user owns this skin and it's not expired
  const { data: ownership } = await supabase
    .from('user_skins')
    .select('id, rental_expires_at, ownership_type')
    .eq('user_id', user.id)
    .eq('skin_id', skin_id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'You do not own this skin' }, { status: 403 })
  }

  // Check rental hasn't expired
  if (ownership.rental_expires_at && new Date(ownership.rental_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This rental has expired' }, { status: 403 })
  }

  // Verify the skin's category matches the requested layer
  const { data: skin } = await supabase
    .from('skins')
    .select('id, category')
    .eq('id', skin_id)
    .maybeSingle()

  if (!skin || skin.category !== layer) {
    return NextResponse.json({ error: 'Skin category does not match the requested layer' }, { status: 400 })
  }

  // Map layer to the loadout column
  const columnMap: Record<string, string> = {
    status: 'status_skin_id',
    squad: 'squad_skin_id',
    deception: 'deception_skin_id',
    earned: 'squad_skin_id', // earned skins occupy the squad slot
    seasonal: 'squad_skin_id',
  }

  const columnName = columnMap[layer]
  if (!columnName) {
    return NextResponse.json({ error: 'Invalid layer' }, { status: 400 })
  }

  // Get the loadout row
  const { data: loadout } = await supabase
    .from('user_skin_loadout')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  updateData[columnName] = skin_id

  if (loadout) {
    // Update existing
    const { error } = await supabase
      .from('user_skin_loadout')
      .update(updateData)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    // Insert new
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      current_status: 'idle',
      status_set_at: new Date().toISOString(),
    }
    insertData[columnName] = skin_id
    const { error } = await supabase
      .from('user_skin_loadout')
      .insert(insertData)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Mark the skin as equipped in user_skins (for the equipped boolean)
  // First unequip all other skins in the same category
  await supabase
    .from('user_skins')
    .update({ equipped: false })
    .eq('user_id', user.id)
    .eq('equipped', true)

  await supabase
    .from('user_skins')
    .update({ equipped: true })
    .eq('user_id', user.id)
    .eq('skin_id', skin_id)

  return NextResponse.json({ success: true, equipped: { layer, skin_id } })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const layer = searchParams.get('layer')

  if (!layer) {
    return NextResponse.json({ error: 'Missing layer parameter' }, { status: 400 })
  }

  const columnMap: Record<string, string> = {
    status: 'status_skin_id',
    squad: 'squad_skin_id',
    deception: 'deception_skin_id',
  }

  const columnName = columnMap[layer]
  if (!columnName) {
    return NextResponse.json({ error: 'Invalid layer' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  updateData[columnName] = null

  const { error } = await supabase
    .from('user_skin_loadout')
    .update(updateData)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, unequipped: { layer } })
}
