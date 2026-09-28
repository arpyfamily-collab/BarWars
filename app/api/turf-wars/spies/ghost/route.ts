import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { getLedHandlers } from '@/lib/spy-handlers'

function ghostError(raw: string | null | undefined): { message: string; status: number } {
  const m = raw ?? ''
  const codes: Record<string, [string, number]> = {
    NOT_A_GHOST: ['Become a Ghost first.', 404],
    GHOST_SUSPENDED: ['Your Ghost is suspended: staff ruled 2 of your reports fake.', 403],
    WAR_NOT_ACTIVE: ['That war is over or not declared yet.', 409],
    OWN_WAR: ["Ghosts can't report on a war their own faction is part of.", 403],
    BAD_CONTENT: ['Reports are 10 to 1,000 characters.', 400],
    REPORT_LIMIT: ["You've filed 3 reports on this war.", 409],
    BAD_PRICE: ['Price is 10 to 100 Valor (40 max for your first 3 reports).', 400],
    BAD_SECOND_PRICE: ['The open-market price is 10 Valor up to your exclusive price.', 400],
    NOT_FOR_SALE: ["That report isn't for sale.", 404],
    INVALID_SIDE: ['Pick which side is buying.', 400],
    OWN_REPORT: ["You can't buy your own report.", 409],
    ALREADY_BOUGHT: ['Your side already has this report.', 409],
    NOT_A_SIDE: ['During the first hour only the two sides of the war (leaders and intel cells) can buy. After that, org leaders, Hessian captains and intel cells can.', 403],
    SOLD_EXCLUSIVE: ['Another side bought this report exclusively.', 409],
    NOT_ENOUGH_VALOR: ["Not enough Valor.", 402],
    NOT_BUYER: ['Only the buyer can rate or flag a report.', 403],
    RATE_AFTER_WAR: ['You can rate a report once its war is over.', 409],
    BAD_RATING: ['Rate 1 to 5.', 400],
  }
  for (const [code, [message, status]] of Object.entries(codes)) if (m.includes(code)) return { message, status }
  return { message: 'Something went wrong. Try again.', status: 500 }
}

export const dynamic = 'force-dynamic'

const CODENAME_ADJECTIVES = ['Silent', 'Shadow', 'Ghost', 'Hidden', 'Velvet', 'Midnight', 'Whisper', 'Iron', 'Phantom', 'Obscure']
const CODENAME_NOUNS = ['Specter', 'Witness', 'Operator', 'Falcon', 'Mirror', 'Cipher', 'Echo', 'Raven', 'Pillar', 'Vagrant']

function generateCodename(): string {
  const adj = CODENAME_ADJECTIVES[Math.floor(Math.random() * CODENAME_ADJECTIVES.length)]
  const noun = CODENAME_NOUNS[Math.floor(Math.random() * CODENAME_NOUNS.length)]
  const num = Math.floor(Math.random() * 900 + 100)
  return `${adj}${noun}${num}`
}

const ACTIVE = ['pending', 'operator_pending', 'live', 'contested']

/**
 * GET /api/turf-wars/spies/ghost — the Ghost market (Testing To-Do item 12b, Valor only)
 *  profile + record + own reports (with prices and sales) + wars the Ghost can report on,
 *  market: teasers of reports this player can buy (never content, never who the Ghost is),
 *  purchased: full reports bought for a side this player leads or sits in the cell of,
 *  leaderboard: top Ghosts by Valor earned (codenames only).
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const s = createServiceClient()

  const { data: profile } = await s.from('ghost_profiles').select('id, codename, reports_count, upgrade_eligible, created_at').eq('user_id', userId!).maybeSingle()
  const g: any = profile

  // Sides this player can buy for: orgs/companies they lead, and intel cells they sit in
  const { orgIds, companyIds } = await getLedHandlers(s, userId!)
  const { data: cellRows } = await s.from('intel_cell_members').select('cell:intel_cells(claim_id, org_id, company_id)').eq('user_id', userId!).is('removed_at', null)
  const cells = ((cellRows as any[]) ?? []).map(r => r.cell).filter(Boolean)
  const canBuyOpen = orgIds.length > 0 || companyIds.length > 0 || cells.length > 0

  // Reports on sale in active wars or released in the last 3 days
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const { data: onSale } = await s.from('ghost_reports')
    .select('id, ghost_id, claim_id, bar_id, status, price, second_price, release_at, is_rookie, created_at, observation, orgs_present, headcount_estimate, claim:turf_claims(status, attacking_org_id, defending_org_id), bar:venues(name)')
    .not('price', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(100)

  const reportIds = ((onSale as any[]) ?? []).map(r => r.id)
  const { data: purchases } = reportIds.length
    ? await s.from('ghost_report_purchases').select('report_id, org_id, company_id, buyer_user_id, price, exclusive, rating, flag_status').in('report_id', reportIds)
    : { data: [] as any[] }

  const ghostIds = Array.from(new Set(((onSale as any[]) ?? []).map(r => r.ghost_id)))
  const { data: ghosts } = ghostIds.length ? await s.from('ghost_profiles').select('id, codename, user_id').in('id', ghostIds) : { data: [] as any[] }
  const ghostById = new Map(((ghosts as any[]) ?? []).map(x => [x.id, x]))
  const records = new Map<string, any>()
  for (const id of ghostIds) { const { data } = await s.rpc('ghost_record', { p_ghost: id }); records.set(id, data) }

  const market: any[] = []
  const purchased: any[] = []
  for (const r of (onSale as any[]) ?? []) {
    const gh = ghostById.get(r.ghost_id)
    if (gh?.user_id === userId) continue
    const warSides: { org_id: string | null; company_id: string | null }[] = []
    for (const o of [r.claim?.attacking_org_id, r.claim?.defending_org_id].filter(Boolean)) {
      if (orgIds.includes(o) || cells.some(c => c.claim_id === r.claim_id && c.org_id === o)) warSides.push({ org_id: o, company_id: null })
    }
    const { data: contracted } = companyIds.length || cells.some(c => c.company_id)
      ? await s.from('hessian_contracts').select('company_id').eq('claim_id', r.claim_id).in('status', ['accepted', 'betrayed', 'completed'])
      : { data: [] as any[] }
    for (const k of (contracted as any[]) ?? []) {
      if (companyIds.includes(k.company_id) || cells.some(c => c.claim_id === r.claim_id && c.company_id === k.company_id)) warSides.push({ org_id: null, company_id: k.company_id })
    }
    const mySides = [...orgIds.map(o => ({ org_id: o, company_id: null })), ...companyIds.map(c => ({ org_id: null, company_id: c })),
                     ...cells.map(c => ({ org_id: c.org_id, company_id: c.company_id }))]
    const bought = ((purchases as any[]) ?? []).find(p => p.report_id === r.id && mySides.some(m => m.org_id === p.org_id && m.company_id === p.company_id))
    const teaser = {
      id: r.id, claim_id: r.claim_id, bar: r.bar?.name ?? 'a bar', filed_at: r.created_at, codename: gh?.codename ?? 'Ghost',
      record: records.get(r.ghost_id), rookie: r.is_rookie, war_active: ACTIVE.includes(r.claim?.status),
    }
    if (bought) {
      purchased.push({ ...teaser, observation: r.observation, orgs_present: r.orgs_present, headcount_estimate: r.headcount_estimate,
                       paid: bought.price, exclusive: bought.exclusive, rating: bought.rating, flagged: !!bought.flag_status, refunded: bought.flag_status === 'refunded', i_bought: bought.buyer_user_id === userId })
      continue
    }
    const exclusiveOpen = r.status === 'held' && new Date(r.release_at) > new Date()
    if (exclusiveOpen && warSides.length) market.push({ ...teaser, mode: 'exclusive', price: r.price, closes_at: r.release_at, sides: warSides })
    else if (!exclusiveOpen && r.status !== 'sold' && r.status !== 'fake' && canBuyOpen) market.push({ ...teaser, mode: 'open', price: r.second_price, sides: mySides.slice(0, 1) })
  }

  // The Ghost's own view
  let mine: any = null
  if (g) {
    const { data: reports } = await s.from('ghost_reports')
      .select('id, claim_id, observation, headcount_estimate, status, price, second_price, release_at, is_rookie, created_at, bar:venues(name)')
      .eq('ghost_id', g.id).order('created_at', { ascending: false }).limit(30)
    const ids = ((reports as any[]) ?? []).map(r => r.id)
    const { data: sales } = ids.length ? await s.from('ghost_report_purchases').select('report_id, price, exclusive, rating').in('report_id', ids) : { data: [] as any[] }
    const { data: wars } = await s.from('turf_claims').select('id, bar:venues(name), window_open_at, window_close_at').in('status', ACTIVE)
    const options: any[] = []
    for (const w of (wars as any[]) ?? []) {
      const { data: inWar } = await s.rpc('in_war_faction', { p_user: userId!, p_claim: w.id })
      if (inWar) continue
      const used = ((reports as any[]) ?? []).filter(r => r.claim_id === w.id).length
      options.push({ claim_id: w.id, bar: w.bar?.name ?? 'a bar', window_close_at: w.window_close_at, reports_left: Math.max(0, 3 - used) })
    }
    const { data: rec } = await s.rpc('ghost_record', { p_ghost: g.id })
    mine = {
      profile: g, record: rec, rookie: (g.reports_count ?? 0) < 3, war_options: options,
      reports: ((reports as any[]) ?? []).map(r => ({
        ...r, bar: r.bar?.name ?? null,
        sales: ((sales as any[]) ?? []).filter(x => x.report_id === r.id),
      })),
    }
  }

  // Leaderboard: top Ghosts by Valor earned
  const { data: all } = await s.from('ghost_profiles').select('id, codename').limit(200)
  const board: any[] = []
  for (const x of (all as any[]) ?? []) {
    const { data: rec } = await s.rpc('ghost_record', { p_ghost: x.id })
    if ((rec as any)?.sold > 0) board.push({ codename: x.codename, ...(rec as any) })
  }
  board.sort((a, b) => b.valor_earned - a.valor_earned)

  // Backward compatible fields for the existing screen
  return ok({ profile: g ?? null, reports: mine?.reports ?? [], ghost: mine, market, purchased, leaderboard: board.slice(0, 10) })
}

/**
 * POST /api/turf-wars/spies/ghost
 *   {} or { email?, original_invite_token? }                  → become a Ghost (codename)
 *   { claim_id, observation, orgs_present?, headcount_estimate?, price, second_price } → file a priced report
 *   { action: 'buy', report_id, org_id | company_id }        → buy (Valor)
 *   { action: 'rate', report_id, rating } | { action: 'flag', report_id, note }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  let body: any
  try { body = await req.json() }
  catch { return err('Invalid JSON') }

  const service = createServiceClient()

  if (body.action === 'buy') {
    const { data, error } = await service.rpc('buy_ghost_report', { p_user: userId!, p_report: body.report_id, p_org: body.org_id ?? null, p_company: body.company_id ?? null })
    if (error) { const e = ghostError(error.message); return err(e.message, e.status) }
    return ok({ ...(data as any), message: (data as any).exclusive ? 'Bought. This report is yours alone.' : 'Bought.' })
  }
  if (body.action === 'rate' || body.action === 'flag') {
    const { data, error } = await service.rpc('rate_ghost_report', {
      p_user: userId!, p_report: body.report_id, p_rating: body.action === 'rate' ? body.rating : null, p_flag_note: body.action === 'flag' ? (body.note || 'Flagged as fake') : null,
    })
    if (error) { const e = ghostError(error.message); return err(e.message, e.status) }
    return ok(data)
  }

  // ─── File a Ghost report (priced, tied to a war) ─────────────────────────────
  if (body.observation) {
    if (!body.claim_id) return err('Pick the war this report is about')
    const { data, error } = await service.rpc('file_ghost_report', {
      p_user: userId!, p_claim: body.claim_id, p_observation: body.observation, p_orgs: body.orgs_present ?? null,
      p_headcount: body.headcount_estimate != null && body.headcount_estimate !== '' ? Number(body.headcount_estimate) : null,
      p_price: Number(body.price), p_second_price: Number(body.second_price),
    })
    if (error) { const e = ghostError(error.message); return err(e.message, e.status) }
    return ok({ ...(data as any), message: 'Filed. For the next hour, a side of this war can buy it exclusively; after that it goes to the open market and a teaser posts on the war feed.' }, 201)
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
