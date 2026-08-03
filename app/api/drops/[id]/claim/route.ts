// app/api/drops/[id]/claim/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data, error } = await service.rpc('claim_drop_pass', {
    p_drop_id: params.id,
    p_user_id: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as any
  if (result.error) {
    const statusCode = result.error === 'Already claimed' ? 409
      : result.error === 'Not eligible'                   ? 403
      : result.error === 'Drop has expired'               ? 410
      : 422
    return NextResponse.json({ error: result.error }, { status: statusCode })
  }

  return NextResponse.json(result, { status: 201 })
}
