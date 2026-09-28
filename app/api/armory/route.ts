import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/armory
 * The Armory shelf: available donated bracelets with their offer and bar, plus stats.
 * Players can't read the armory table directly (To-Do item 13); donors are never shown.
 */
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await service
    .from('armory')
    .select(`
      id, created_at, donated_by, current_venue_id,
      venue:venues!armory_current_venue_id_fkey(name),
      bracelet:bracelet_drops!armory_bracelet_id_fkey(offer_type, offer_value)
    `)
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Could not load the Armory' }, { status: 500 })

  const [{ count: total }, { count: claimedWeek }, { data: myClaim }] = await Promise.all([
    service.from('armory').select('id', { count: 'exact', head: true }),
    service.from('armory').select('id', { count: 'exact', head: true }).gte('claimed_at', sevenDaysAgo),
    service.from('armory').select('claimed_at').eq('claimed_by', user.id).gte('claimed_at', sevenDaysAgo)
      .order('claimed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const items = ((rows as any[]) ?? []).map(r => ({
    id: r.id,
    created_at: r.created_at,
    bar_name: r.venue?.name ?? null,
    offer_type: r.bracelet?.offer_type ?? null,
    offer_value: r.bracelet?.offer_value ?? null,
    mine: r.donated_by === user.id,
  }))

  const nextClaimAt = myClaim
    ? new Date(new Date((myClaim as any).claimed_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null

  return NextResponse.json({
    items,
    stats: { totalDonated: total ?? 0, availableNow: items.length, claimedThisWeek: claimedWeek ?? 0 },
    claimedThisWeek: !!myClaim,
    nextClaimAt,
  })
}
