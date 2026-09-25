import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { armory_id } = body

  if (!armory_id || typeof armory_id !== 'string') {
    return NextResponse.json({ error: 'Missing armory_id' }, { status: 400 })
  }

  const service = createServiceClient()

  // Check the user hasn't already claimed a bracelet in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentClaim } = await service
    .from('armory')
    .select('id')
    .eq('claimed_by', user.id)
    .gte('claimed_at', sevenDaysAgo)
    .limit(1)
    .maybeSingle()

  if (recentClaim) {
    return NextResponse.json(
      { error: 'You already claimed a bracelet this week. Come back next week.' },
      { status: 429 }
    )
  }

  // Verify the item is still available
  const { data: item } = await service
    .from('armory')
    .select('id, status')
    .eq('id', armory_id)
    .eq('status', 'available')
    .maybeSingle()

  if (!item) {
    return NextResponse.json({ error: 'This bracelet is no longer available.' }, { status: 404 })
  }

  // Claim it — atomic update with status guard
  const { data: claimed, error } = await service
    .from('armory')
    .update({
      status: 'claimed',
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', armory_id)
    .eq('status', 'available')
    .select('id, offer_value')
    .single()

  if (error || !claimed) {
    return NextResponse.json({ error: 'Someone else grabbed it first. Try another.' }, { status: 409 })
  }

  return NextResponse.json({ success: true, claimed })
}
