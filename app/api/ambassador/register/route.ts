/**
 * Ambassador API routes
 *
 * POST /api/ambassador/register          — enroll as ambassador
 * GET  /api/ambassador/referral/[code]   — resolve a referral code (for landing page)
 * GET  /api/ambassador/tiers             — tier definitions (public)
 * POST /api/ambassador/bars/[id]/compensate — bar issues credit to an ambassador
 */

// ── POST /api/ambassador/register ────────────────────────────────────────────
// app/api/ambassador/register/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { chapter_name, chapter_code } = body

  const service = createServiceClient()

  // Idempotent — return existing record if already enrolled
  const { data: existing } = await service
    .from('ambassadors')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (existing) return NextResponse.json({ ambassador: existing, already_enrolled: true })

  const { data: ambassador, error } = await service
    .from('ambassadors')
    .insert({
      user_id:      user.id,
      chapter_name: chapter_name ?? null,
      chapter_code: chapter_code ? chapter_code.toUpperCase().replace(/\s+/g, '-') : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ambassador }, { status: 201 })
}
