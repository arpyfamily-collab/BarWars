import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

const HOURS_72 = 72 * 60 * 60 * 1000
const COOLDOWN_DAYS: Record<string, number> = { greek: 7, company: 7, regiment: 3, mercenary: 7, spy: 14 }

/**
 * GET /api/factions/me
 * The caller's factions with what leaving would mean right now (grace, live war, cooldown),
 * any captain step-down in progress, and the cooldowns currently running on them.
 */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const s = createServiceClient()
  const uid = userId!

  const [{ data: orgs }, { data: hms }, { data: captained }, { data: rms }, { data: capRegs }, { data: merc }, { data: spy }, { data: history }] = await Promise.all([
    s.from('org_memberships').select('org_id, role, verified, created_at, org:greek_orgs(name)').eq('user_id', uid),
    s.from('hessian_members').select('company_id, role, verified, joined_at, company:hessian_companies(name, captain_id, created_at)').eq('user_id', uid),
    s.from('hessian_companies').select('id, name, created_at').eq('captain_id', uid),
    s.from('regiment_members').select('regiment_id, role, joined_at, regiment:regiments(name, captain_id, created_at)').eq('user_id', uid),
    s.from('regiments').select('id, name, created_at').eq('captain_id', uid),
    s.from('mercenaries').select('id, created_at').eq('user_id', uid).eq('is_active', true).maybeSingle(),
    s.from('spy_assets').select('created_at').eq('asset_user_id', uid).eq('is_active', true).order('created_at').limit(1),
    s.from('faction_history').select('faction_type, left_at, grace, reason, was_captain').eq('user_id', uid)
      .gte('left_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('left_at', { ascending: false }),
  ])

  const factions: any[] = []
  const add = (f: any) => factions.push(f)

  for (const o of (orgs as any[]) ?? []) {
    add({ type: 'greek', id: o.org_id, name: o.org?.name ?? 'Greek org', role: o.verified ? (o.role === 'admin' ? 'admin' : 'member') : 'pending', joined_at: o.created_at })
  }
  const companyIds = new Set<string>()
  for (const c of (captained as any[]) ?? []) {
    companyIds.add(c.id)
    add({ type: 'company', id: c.id, name: c.name, role: 'captain', joined_at: c.created_at, unit_created_at: c.created_at })
  }
  for (const h of (hms as any[]) ?? []) {
    if (companyIds.has(h.company_id)) continue
    add({ type: 'company', id: h.company_id, name: h.company?.name ?? 'Hessian company', role: h.verified ? 'member' : 'pending', joined_at: h.joined_at })
  }
  const regimentIds = new Set<string>()
  for (const r of (capRegs as any[]) ?? []) {
    regimentIds.add(r.id)
    add({ type: 'regiment', id: r.id, name: r.name, role: 'captain', joined_at: r.created_at, unit_created_at: r.created_at })
  }
  for (const r of (rms as any[]) ?? []) {
    if (regimentIds.has(r.regiment_id)) continue
    add({ type: 'regiment', id: r.regiment_id, name: r.regiment?.name ?? 'Regiment', role: 'member', joined_at: r.joined_at })
  }
  if (merc) add({ type: 'mercenary', id: (merc as any).id, name: 'Solo mercenary', role: 'member', joined_at: (merc as any).created_at })
  if (spy && (spy as any[]).length) add({ type: 'spy', id: null, name: 'Spy asset', role: 'member', joined_at: (spy as any[])[0].created_at })

  // What leaving means right now
  for (const f of factions) {
    if (f.role === 'pending') { f.leave = { grace: true, live_war: false, cooldown_days: 0 }; continue }
    const since = f.unit_created_at ?? f.joined_at
    const [{ data: live }, { data: engaged }] = await Promise.all([
      f.type === 'spy' ? Promise.resolve({ data: false }) : s.rpc('faction_in_live_war', { p_type: f.type, p_id: f.id }),
      f.type === 'spy' ? Promise.resolve({ data: false }) : s.rpc('faction_engaged_since', { p_type: f.type, p_id: f.id, p_since: since }),
    ])
    const grace = Date.now() - new Date(since).getTime() < HOURS_72 && !engaged
    f.leave = { grace, live_war: !!live, cooldown_days: grace ? 0 : COOLDOWN_DAYS[f.type] ?? 0, grace_ends_at: new Date(new Date(since).getTime() + HOURS_72).toISOString() }
  }

  // Captain step-downs in progress for the caller's units
  for (const f of factions.filter(x => x.type === 'company' || x.type === 'regiment')) {
    const { data: sd } = await s.from('captain_stepdowns').select('id, captain_id, ends_at, nominee_id, started_at')
      .eq('faction_type', f.type).eq('faction_id', f.id).eq('status', 'pending').maybeSingle()
    if (sd) {
      const ids = [(sd as any).captain_id, (sd as any).nominee_id].filter(Boolean)
      const { data: names } = ids.length ? await s.from('public_profiles').select('id, display_name').in('id', ids) : { data: [] }
      const nameOf = (id: string | null) => ((names as any[]) ?? []).find(n => n.id === id)?.display_name ?? null
      f.stepdown = {
        ends_at: (sd as any).ends_at, captain_name: nameOf((sd as any).captain_id),
        nominee_id: (sd as any).nominee_id, nominee_name: nameOf((sd as any).nominee_id),
        i_am_nominee: (sd as any).nominee_id === uid,
      }
    }
    if (f.role === 'captain') {
      const { data: mem } = f.type === 'company'
        ? await s.from('hessian_members').select('user_id, joined_at').eq('company_id', f.id).eq('verified', true).neq('user_id', uid).order('joined_at')
        : await s.from('regiment_members').select('user_id, joined_at').eq('regiment_id', f.id).neq('user_id', uid).order('joined_at')
      const ids = ((mem as any[]) ?? []).map(m => m.user_id)
      const { data: names } = ids.length ? await s.from('public_profiles').select('id, display_name').in('id', ids) : { data: [] }
      f.members = ids.map(id => ({ id, name: ((names as any[]) ?? []).find(n => n.id === id)?.display_name ?? 'Member' }))
    }
  }

  // Cooldowns and locks running now
  const cooldowns: any[] = []
  for (const h of (history as any[]) ?? []) {
    if (h.grace || h.reason === 'staff_move' || h.reason === 'disbanded') continue
    const days = COOLDOWN_DAYS[h.faction_type] ?? 0
    const until = new Date(new Date(h.left_at).getTime() + days * 86400000)
    if (until.getTime() > Date.now() && !cooldowns.some(c => c.type === h.faction_type)) cooldowns.push({ type: h.faction_type, until: until.toISOString() })
    if (h.was_captain && ['stepped_down', 'left'].includes(h.reason) && !cooldowns.some(c => c.type === 'ex_captain')) {
      const lock = new Date(new Date(h.left_at).getTime() + 30 * 86400000)
      if (lock.getTime() > Date.now()) cooldowns.push({ type: 'ex_captain', until: lock.toISOString() })
    }
  }

  return ok({ factions, cooldowns })
}
