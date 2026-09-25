import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('flares')
    .select('*, venues(name, slug)')
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('fired_at', { ascending: false })
  return NextResponse.json(data ?? [])
}
