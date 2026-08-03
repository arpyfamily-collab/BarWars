// app/api/drops/[id]/guess/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { distribution } = await req.json()
  if (!distribution || typeof distribution !== 'object') {
    return NextResponse.json({ error: 'distribution is required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: drop } = await service
    .from('mystery_drops')
    .select('total_passes, status')
    .eq('id', params.id)
    .single()

  if (!drop) return NextResponse.json({ error: 'Drop not found' }, { status: 404 })

  if (!['scheduled', 'queue_open'].includes((drop as any).status)) {
    return NextResponse.json({ error: 'Guesses must be submitted before the drop goes live' }, { status: 422 })
  }

  // Validate total equals drop's total_passes
  const guessTotal = Object.values(distribution as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
  if (guessTotal !== (drop as any).total_passes) {
    return NextResponse.json({ error: `Guess must total ${(drop as any).total_passes} passes` }, { status: 400 })
  }

  const { data, error } = await service
    .from('drop_guesses')
    .upsert({ drop_id: params.id, user_id: user.id, guessed_distribution: distribution }, { onConflict: 'drop_id,user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
