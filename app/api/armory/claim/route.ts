import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/armory/claim  { armory_id }
 * One claim per player per rolling 7 days, never your own donation. The database function
 * claim_armory enforces both, so direct table writes can't get around them (To-Do item 13).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const armoryId = body?.armory_id
  if (!armoryId || typeof armoryId !== 'string') {
    return NextResponse.json({ error: 'Missing armory_id' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.rpc('claim_armory', { p_user: user.id, p_armory: armoryId })

  if (error) {
    const m = error.message || ''
    if (m.includes('WEEKLY_LIMIT')) {
      return NextResponse.json({ error: 'You already claimed a bracelet this week. Come back next week.' }, { status: 429 })
    }
    if (m.includes('OWN_DONATION')) {
      return NextResponse.json({ error: "That's your own donation. Leave it for someone else." }, { status: 403 })
    }
    if (m.includes('NOT_AVAILABLE') || m.includes('invalid input syntax')) {
      return NextResponse.json({ error: 'This bracelet is no longer available.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Could not claim that bracelet. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, claimed: data })
}
