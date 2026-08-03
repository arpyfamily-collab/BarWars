/**
 * POST /api/push/register
 * Upserts the caller's FCM token in user_push_tokens.
 * One token per platform per user — updates if already exists.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, platform = 'web' } = await req.json()
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const validPlatforms = ['web', 'ios', 'android']
  if (!validPlatforms.includes(platform)) {
    return NextResponse.json({ error: `platform must be one of: ${validPlatforms.join(', ')}` }, { status: 400 })
  }

  const service = createServiceClient()

  // Upsert — unique constraint on (user_id, platform)
  const { error } = await service
    .from('user_push_tokens')
    .upsert({
      user_id:    user.id,
      fcm_token:  token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' })

  if (error) {
    console.error('[push/register]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ registered: true, platform })
}

// DELETE — unregister (e.g. on sign out or explicit opt-out)
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { platform = 'web' } = await req.json().catch(() => ({}))
  const service = createServiceClient()

  await service
    .from('user_push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', platform)

  return NextResponse.json({ unregistered: true })
}
