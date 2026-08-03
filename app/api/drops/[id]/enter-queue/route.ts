// app/api/drops/[id]/enter-queue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: drop } = await service
    .from('mystery_drops')
    .select('id, status, queue_opens_at, drop_at')
    .eq('id', params.id)
    .single()

  if (!drop) return NextResponse.json({ error: 'Drop not found' }, { status: 404 })

  if (!['queue_open', 'scheduled'].includes((drop as any).status)) {
    return NextResponse.json({ error: 'Queue is not open' }, { status: 422 })
  }

  // Library Card holders can enter 5 minutes early
  const { data: cardSub } = await service
    .from('library_card_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  const isCardHolder    = !!cardSub
  const queueOpensAt    = new Date((drop as any).queue_opens_at)
  const earlyAccessTime = new Date(queueOpensAt.getTime() - 5 * 60 * 1000)
  const now             = new Date()

  if (!isCardHolder && now < queueOpensAt) {
    const secsUntilOpen = Math.ceil((queueOpensAt.getTime() - now.getTime()) / 1000)
    return NextResponse.json({ error: `Queue opens in ${secsUntilOpen}s`, opens_at: (drop as any).queue_opens_at }, { status: 425 })
  }

  if (isCardHolder && now < earlyAccessTime) {
    return NextResponse.json({ error: 'Too early even for Library Card', opens_at: earlyAccessTime.toISOString() }, { status: 425 })
  }

  const { data: entry, error } = await service
    .from('drop_queue_entries')
    .insert({ drop_id: params.id, user_id: user.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Already in queue — return existing entry
      const { data: existing } = await service
        .from('drop_queue_entries')
        .select('*')
        .eq('drop_id', params.id)
        .eq('user_id', user.id)
        .single()
      return NextResponse.json({ entry: existing, already_joined: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entry, is_card_holder: isCardHolder }, { status: 201 })
}
