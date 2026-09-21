import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

const CODENAME_ADJECTIVES = ['Silent', 'Shadow', 'Ghost', 'Hidden', 'Velvet', 'Midnight', 'Whisper', 'Iron', 'Phantom', 'Obscure']
const CODENAME_NOUNS = ['Specter', 'Witness', 'Operator', 'Falcon', 'Mirror', 'Cipher', 'Echo', 'Raven', 'Pillar', 'Vagrant']

function generateCodename(): string {
  const adj = CODENAME_ADJECTIVES[Math.floor(Math.random() * CODENAME_ADJECTIVES.length)]
  const noun = CODENAME_NOUNS[Math.floor(Math.random() * CODENAME_NOUNS.length)]
  const num = Math.floor(Math.random() * 900 + 100)
  return `${adj}${noun}${num}`
}

/**
 * GET /api/turf-wars/spies/ghost
 * Returns the caller's ghost profile (if any) and their reports.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const service = createServiceClient()

  const { data: profile } = await service
    .from('ghost_profiles')
    .select('*')
    .eq('user_id', userId!)
    .maybeSingle()

  if (!profile) return ok(null)

  const { data: reports } = await service
    .from('ghost_reports')
    .select('id, observation, orgs_present, headcount_estimate, quality_rating, created_at')
    .eq('ghost_id', (profile as any).id)
    .order('created_at', { ascending: false })

  return ok({ profile, reports: (reports as any[]) ?? [] })
}

/**
 * POST /api/turf-wars/spies/ghost
 *
 * Create a ghost profile:
 *   { email?, original_invite_token? }
 *   Returns a generated codename.
 *
 * Submit a ghost report:
 *   { observation, orgs_present?, headcount_estimate?, claim_id?, bar_id? }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  // ─── Submit ghost report ─────────────────────────────────────────────────────
  if (body.observation) {
    if (body.observation.length < 10) return err('Observation must be at least 10 characters')

    // Get the caller's ghost profile
    const { data: profile } = await service
      .from('ghost_profiles')
      .select('id, reports_count, upgrade_eligible')
      .eq('user_id', userId!)
      .maybeSingle()

    if (!profile) return err('Create your ghost profile first', 404)

    const p = profile as any

    const { data, error } = await service
    .from('ghost_reports')
      .insert({
        ghost_id: p.id,
        claim_id: body.claim_id ?? null,
        bar_id: body.bar_id ?? null,
        observation: body.observation,
        orgs_present: body.orgs_present ?? null,
        headcount_estimate: body.headcount_estimate ?? null,
      })
      .select('id, observation, created_at')
      .single()

    if (error) return err(error.message, 500)

    // Increment reports count
    const newCount = p.reports_count + 1
    await service
      .from('ghost_profiles')
      .update({ reports_count: newCount })
      .eq('id', p.id)

    // After 3 reports, mark as upgrade eligible
    if (newCount >= 3 && !p.upgrade_eligible) {
      await service
        .from('ghost_profiles')
        .update({ upgrade_eligible: true })
        .eq('id', p.id)

      return ok({
        ...data,
        upgrade_eligible: true,
        message: 'You\'ve submitted 3 reports. You\'re eligible for a full upgrade — become a Hessian, join a Regiment, or take a specific spy role.',
      })
    }

    return ok({ ...data, reports_count: newCount })
  }

  // ─── Create ghost profile ───────────────────────────────────────────────────
  const { data: existing } = await service
    .from('ghost_profiles')
    .select('id, codename')
    .eq('user_id', userId!)
    .maybeSingle()

  if (existing) return err('You already have a ghost profile', 409)

  // Generate a unique codename
  let codename = generateCodename()
  for (let i = 0; i < 5; i++) {
    const { data: existingName } = await service
      .from('ghost_profiles')
      .select('id')
      .eq('codename', codename)
      .maybeSingle()
    if (!existingName) break
    codename = generateCodename()
  }

  const { data, error } = await service
    .from('ghost_profiles')
    .insert({
      user_id: userId!,
      codename,
      email: body.email ?? null,
      original_invite_token: body.original_invite_token ?? null,
    })
    .select('id, codename, created_at')
    .single()

  if (error) return err(error.message, 500)

  return ok({ ...data, message: `You are now ${codename}. Submit observation reports from events you attend. Three quality reports earn you a full upgrade.` }, 201)
}
