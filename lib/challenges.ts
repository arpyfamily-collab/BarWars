/**
 * lib/challenges.ts
 *
 * Shared auth + validation helpers for all challenge API routes.
 * Every route imports from here — no duplicated role-checking logic.
 */

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// ─── Role resolution ───────────────────────────────────────────────────────────

export type ChallengeRole =
  | { type: 'operator' }
  | { type: 'bar_admin'; bar_id: string }
  | { type: 'patron' }
  | { type: 'unauthenticated' }

/**
 * Resolves the calling user's role against the challenge system.
 * Returns their identity, or null if unauthenticated.
 */
export async function resolveRole(userId: string): Promise<ChallengeRole> {
  const service = createServiceClient()

  // Platform operator — profile.is_staff = true AND no specific bar assignment
  const { data: profile } = await service
    .from('profiles')
    .select('is_staff')
    .eq('id', userId)
    .single()

  // Check bar admin assignment
  const { data: barAdmin } = await service
    .from('bar_admins')
    .select('bar_id')
    .eq('user_id', userId)
    .single()

  if (barAdmin?.bar_id)          return { type: 'bar_admin', bar_id: barAdmin.bar_id }
  if (profile?.is_staff === true) return { type: 'operator' }
  return { type: 'patron' }
}

/**
 * Asserts the caller is authenticated and returns their user ID.
 * Returns a 401 NextResponse if not.
 */
export async function requireAuth(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { userId: null, error: err('Unauthorized', 401) }
  return { userId: user.id, error: null }
}

/**
 * Asserts the caller is a bar admin for the given bar.
 */
export async function requireBarAdmin(
  userId: string,
  barId:  string
): Promise<NextResponse | null> {
  const role = await resolveRole(userId)
  if (role.type === 'operator') return null // operators can act on any bar
  if (role.type === 'bar_admin' && role.bar_id === barId) return null
  return err('Forbidden — not an admin of this bar', 403)
}

/**
 * Asserts the caller is a platform operator.
 */
export async function requireOperator(userId: string): Promise<NextResponse | null> {
  const role = await resolveRole(userId)
  if (role.type === 'operator') return null
  return err('Forbidden — operator access required', 403)
}

// ─── Validation ────────────────────────────────────────────────────────────────

export interface ChallengeProposalPayload {
  opponent_bar_id:    string
  window_start:       string   // ISO timestamp
  window_end:         string
  scoring_metric:     string
  stakes_description: string
  trash_talk:         string
  score_weights?:     Record<string, number>
}

export function validateProposal(body: Partial<ChallengeProposalPayload>): string | null {
  if (!body.opponent_bar_id)    return 'opponent_bar_id is required'
  if (!body.window_start)       return 'window_start is required'
  if (!body.window_end)         return 'window_end is required'
  if (!body.stakes_description) return 'stakes_description is required'
  if (!body.trash_talk)         return 'trash_talk is required'
  if (body.trash_talk.length > 120) return 'trash_talk must be 120 characters or fewer'

  const start  = new Date(body.window_start)
  const end    = new Date(body.window_end)
  const now    = new Date()

  if (isNaN(start.getTime())) return 'window_start is not a valid date'
  if (isNaN(end.getTime()))   return 'window_end is not a valid date'
  if (start <= now)           return 'window_start must be in the future'
  if (end <= start)           return 'window_end must be after window_start'

  const durationHours = (end.getTime() - start.getTime()) / 3_600_000
  if (durationHours < 2) return 'Challenge window must be at least 2 hours'
  if (durationHours > 8) return 'Challenge window cannot exceed 8 hours'

  const validMetrics = ['checkins_only', 'passes_only', 'checkins_and_passes', 'full_composite']
  if (body.scoring_metric && !validMetrics.includes(body.scoring_metric)) {
    return `Invalid scoring_metric. Must be one of: ${validMetrics.join(', ')}`
  }

  return null
}

// ─── Queue a challenge notification ──────────────────────────────────────────

export async function queueAndSendNotification(
  challengeId: string,
  trigger:     string,
  audience:    string,
  headline:    string,
  body?:       string,
  deepLink?:   string
): Promise<void> {
  const service = createServiceClient()

  await service.from('challenge_notifications').insert({
    challenge_id: challengeId,
    trigger_type: trigger,
    audience,
    headline,
    body:         body    ?? null,
    deep_link:    deepLink ?? `/challenge/${challengeId}`,
    scheduled_at: new Date().toISOString(),
  })

  // Fire-and-forget to the notifications edge function
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/challenge-notifications`
  fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ challenge_id: challengeId, trigger, audience }),
  }).catch(e => console.error('[challenges] notification dispatch failed:', e))
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
