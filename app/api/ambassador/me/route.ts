import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: ambassador } = await service
    .from('ambassadors')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!ambassador) {
    return NextResponse.json({ ambassador: null, compensation: [] })
  }

  const { data: compensation } = await service
    .from('ambassador_compensation')
    .select('*')
    .eq('ambassador_id', ambassador.id)
    .order('issued_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ ambassador, compensation: compensation ?? [] })
}
