import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * Ghost Wiretap (item 18 Phase 2, Brian Sep 28): one per Ghost per war. Pick a side; for 10 minutes
 * the Ghost reads what that side posts in its war chat, with no names. Never on your own faction's war.
 * GET → live wars with this Ghost's wiretap (and what it picked up); POST { claim_id, side }
 */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const { data: g } = await s.from('ghost_profiles').select('id').eq('user_id', userId!).maybeSingle()
  if (!g) return ok({ ghost: false, wars: [] })
  const { data: wars } = await s.from('turf_claims')
    .select('id, bar:venues(name), attacker:greek_orgs!attacking_org_id(name), defender:greek_orgs!defending_org_id(name)')
    .in('status', ['live', 'contested']).not('defending_org_id', 'is', null)
  const out = []
  for (const w of (wars as any[]) ?? []) {
    const { data: own } = await s.rpc('in_war_faction', { p_user: userId, p_claim: w.id })
    if (own) continue
    const { data: feed } = await s.rpc('ghost_wiretap_feed', { p_user: userId, p_claim: w.id })
    out.push({ id: w.id, bar: w.bar?.name, attacker: w.attacker?.name, defender: w.defender?.name, wiretap: feed ?? null })
  }
  return ok({ ghost: true, wars: out })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  const { data, error: e } = await createServiceClient().rpc('ghost_wiretap', { p_user: userId, p_claim: body.claim_id, p_side: body.side })
  if (e) {
    const m: Record<string, [string, number]> = {
      NOT_A_GHOST: ['Become a Ghost first.', 403], GHOST_SUSPENDED: ['Your Ghost is suspended.', 403],
      WAR_NOT_LIVE: ['That war is not live.', 409], OWN_WAR: ["You can't wiretap a war your faction is in.", 403],
      WIRETAP_USED: ['You already used your wiretap on this war.', 409], BAD_SIDE: ['Pick a side.', 400],
    }
    for (const [k, [msg, st]] of Object.entries(m)) if (e.message.includes(k)) return err(msg, st)
    return err('Could not wiretap.', 500)
  }
  return ok({ ...(data as any), message: 'Wiretap live for 10 minutes.' })
}
