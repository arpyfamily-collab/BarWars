import { NextRequest } from 'next/server'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

/**
 * GET /api/greek-orgs — list all Greek orgs (public)
 */
export async function GET() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('greek_orgs')
    .select('id, name, org_type, chapter, verified_member_count, turf_wins, turf_losses, turf_streak_weeks, home_turf_bar_id')
    .order('name', { ascending: true })

  if (error) return err(error.message, 500)
  return ok(data)
}

/**
 * POST /api/greek-orgs — create a new Greek org
 * The creator automatically becomes a verified admin member.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: { org_type: string; name: string; chapter?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  if (!body.org_type || !['fraternity', 'sorority'].includes(body.org_type)) {
    return err('org_type must be "fraternity" or "sorority"')
  }
  if (!body.name?.trim()) return err('name is required')
  if (body.name.length > 80) return err('name must be 80 characters or fewer')

  const service = createServiceClient()

  // Check if org already exists
  const { data: existing } = await service
    .from('greek_orgs')
    .select('id')
    .eq('name', body.name.trim())
    .eq('chapter', body.chapter?.trim() || 'Main')
    .maybeSingle()

  if (existing) return err('An org with this name and chapter already exists', 409)

  // Create the org
  const { data: org, error: orgError } = await service
    .from('greek_orgs')
    .insert({
      org_type: body.org_type,
      name: body.name.trim(),
      chapter: body.chapter?.trim() || 'Main',
    })
    .select('id, name, org_type, chapter')
    .single()

  if (orgError) return err(orgError.message, 500)

  // Make the creator a verified admin
  const { error: memberError } = await service
    .from('org_memberships')
    .insert({
      org_id: (org as any).id,
      user_id: userId,
      role: 'admin',
      verified: true,
      verified_by: userId,
      verified_at: new Date().toISOString(),
    })

  if (memberError) return err(memberError.message, 500)

  return ok(org, 201)
}
