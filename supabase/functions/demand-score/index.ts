/**
 * demand-score
 *
 * Fetches game data from CollegeFootballData.com and computes a
 * demand score (0-100) for a given date + venue.
 *
 * Scoring model (weights sum to 100):
 *   - Combined record quality   20 pts  (wins, losses, win-pct of both teams)
 *   - Rankings                  20 pts  (ranked teams = major demand spike)
 *   - Betting spread tightness  15 pts  (close game = more interest)
 *   - Total (over/under)        10 pts  (high-scoring = more excitement)
 *   - Conference/rivalry flag   20 pts  (SEC games, Ole Miss rivalry games)
 *   - Historical fan travel      15 pts  (opposing school's typical travel rate)
 *
 * Output maps score → night tier, price multiplier, release timing, pass cap.
 *
 * Deploy: supabase functions deploy demand-score
 * Invoke: POST /functions/v1/demand-score { date, venue_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CFBD_BASE     = 'https://api.collegefootballdata.com'
const CFBD_KEY      = Deno.env.get('CFBD_API_KEY') ?? ''
const OLE_MISS_TEAM = 'Ole Miss'

// Historical away-fan travel rates by school (% of stadium capacity)
const TRAVEL_RATES: Record<string, number> = {
  'Alabama':        0.25,
  'LSU':            0.20,
  'Georgia':        0.18,
  'Auburn':         0.15,
  'Tennessee':      0.15,
  'Texas A&M':      0.12,
  'Arkansas':       0.18,
  'Mississippi State': 0.22,
  'Florida':        0.10,
  'South Carolina': 0.08,
  'Kentucky':       0.06,
  'Vanderbilt':     0.05,
  'Missouri':       0.08,
}

const HIGH_TRAVEL_THRESHOLD = 0.15

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const { date, venue_id } = await req.json()
  if (!date || !venue_id) return json({ error: 'date and venue_id required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // Check cache first (same date + venue)
  const { data: cached } = await supabase
    .from('demand_events')
    .select('*')
    .eq('event_date', date)
    .eq('venue_id', venue_id)
    .single()

  if (cached && new Date((cached as any).fetched_at) > new Date(Date.now() - 6 * 3600 * 1000)) {
    return json({ ...cached, cached: true })
  }

  // Fetch from CFBD
  const year  = new Date(date).getFullYear()
  const game  = await fetchOleMissGame(date, year)

  if (!game) {
    // No game this week — compute baseline demand for a regular night
    const baseline = buildBaseline(date)
    await upsertDemandEvent(supabase, venue_id, date, baseline)
    return json({ ...baseline, game_found: false })
  }

  const score   = computeScore(game)
  const output  = scoreToOutput(score, game)
  const record  = { ...game, ...output, demand_score: score }

  await upsertDemandEvent(supabase, venue_id, date, record)
  return json({ ...record, game_found: true })
})

// ─── CFBD fetch ───────────────────────────────────────────────────────────────

async function fetchOleMissGame(date: string, year: number): Promise<GameData | null> {
  if (!CFBD_KEY) {
    console.warn('[demand-score] CFBD_API_KEY not set — returning null')
    return null
  }

  // Get games for Ole Miss in the relevant week
  const d         = new Date(date)
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - d.getDay())   // Sunday of that week
  const weekEnd   = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const headers = {
    'Authorization': `Bearer ${CFBD_KEY}`,
    'Accept':        'application/json',
  }

  const gamesRes = await fetch(
    `${CFBD_BASE}/games?year=${year}&team=${encodeURIComponent(OLE_MISS_TEAM)}&seasonType=regular`,
    { headers }
  )
  const games: any[] = await gamesRes.json()

  // Find the game closest to date (within the same week)
  const game = games.find(g => {
    const gDate = new Date(g.start_date)
    return gDate >= weekStart && gDate <= weekEnd
  })

  if (!game) return null

  const isHome       = game.home_team === OLE_MISS_TEAM
  const opponent     = isHome ? game.away_team : game.home_team
  const opponentConf = isHome ? game.away_conference : game.home_conference

  // Fetch records
  const recordsRes = await fetch(
    `${CFBD_BASE}/records?year=${year}&team=${encodeURIComponent(opponent)}`,
    { headers }
  )
  const records: any[] = await recordsRes.json()
  const opRecord = records[0]

  // Fetch rankings
  const rankRes = await fetch(
    `${CFBD_BASE}/rankings?year=${year}&seasonType=regular`,
    { headers }
  )
  const allRankings: any[] = await rankRes.json()
  const latestPoll  = allRankings.find(w => w.polls?.some((p: any) => p.poll === 'AP Top 25'))
  const apRankings  = latestPoll?.polls?.find((p: any) => p.poll === 'AP Top 25')?.ranks ?? []

  const oleMissRank = apRankings.find((r: any) => r.school === OLE_MISS_TEAM)?.rank ?? null
  const oppRank     = apRankings.find((r: any) => r.school === opponent)?.rank        ?? null

  // Fetch lines (betting)
  const linesRes = await fetch(
    `${CFBD_BASE}/lines?year=${year}&week=${game.week}&team=${encodeURIComponent(OLE_MISS_TEAM)}`,
    { headers }
  )
  const linesData: any[] = await linesRes.json()
  const line = linesData?.[0]?.lines?.[0]

  // Ole Miss record from same records endpoint
  const omRecordRes = await fetch(
    `${CFBD_BASE}/records?year=${year}&team=${encodeURIComponent(OLE_MISS_TEAM)}`,
    { headers }
  )
  const omRecords: any[] = await omRecordRes.json()
  const omRecord = omRecords[0]

  return {
    home_team:        game.home_team,
    away_team:        game.away_team,
    home_record:      omRecord ? `${omRecord.total.wins}-${omRecord.total.losses}` : null,
    away_record:      opRecord ? `${opRecord.total.wins}-${opRecord.total.losses}` : null,
    home_rank:        isHome ? oleMissRank : oppRank,
    away_rank:        isHome ? oppRank : oleMissRank,
    spread:           line?.spread ? parseFloat(line.spread) : null,
    total:            line?.overUnder ? parseFloat(line.overUnder) : null,
    game_time:        new Date(game.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT',
    is_rivalry:       ['Mississippi State', 'Alabama', 'LSU'].includes(opponent),
    is_conference:    opponentConf === 'SEC',
    neutral_site:     game.neutral_site ?? false,
    opponent,
    travel_rate:      TRAVEL_RATES[opponent] ?? 0.05,
  }
}

// ─── Score computation ────────────────────────────────────────────────────────

interface GameData {
  home_team:     string
  away_team:     string
  home_record:   string | null
  away_record:   string | null
  home_rank:     number | null
  away_rank:     number | null
  spread:        number | null
  total:         number | null
  game_time:     string
  is_rivalry:    boolean
  is_conference: boolean
  neutral_site:  boolean
  opponent:      string
  travel_rate:   number
}

function computeScore(g: GameData): number {
  let score = 0

  // 1. Record quality (20 pts)
  const parseRecord = (r: string | null) => {
    if (!r) return 0.5
    const [w, l] = r.split('-').map(Number)
    return (w + l) === 0 ? 0.5 : w / (w + l)
  }
  const homeWinPct = parseRecord(g.home_record)
  const awayWinPct = parseRecord(g.away_record)
  const avgQuality = (homeWinPct + awayWinPct) / 2
  score += Math.round(avgQuality * 20)

  // 2. Rankings (20 pts)
  const bothRanked   = g.home_rank !== null && g.away_rank !== null
  const oneRanked    = g.home_rank !== null || g.away_rank !== null
  const topTenGame   = [g.home_rank, g.away_rank].some(r => r !== null && r <= 10)
  if (bothRanked && topTenGame) score += 20
  else if (bothRanked)          score += 16
  else if (topTenGame)          score += 14
  else if (oneRanked)           score += 8

  // 3. Spread tightness (15 pts) — tight spread = better game expected
  if (g.spread !== null) {
    const absSpread = Math.abs(g.spread)
    if (absSpread <= 3)       score += 15
    else if (absSpread <= 7)  score += 10
    else if (absSpread <= 14) score += 5
  } else {
    score += 7  // no line data → neutral
  }

  // 4. Over/under (10 pts) — higher total = more scoring expected
  if (g.total !== null) {
    if (g.total >= 65)       score += 10
    else if (g.total >= 55)  score += 7
    else if (g.total >= 45)  score += 4
  } else {
    score += 5
  }

  // 5. Conference / rivalry (20 pts)
  if (g.is_rivalry)          score += 20
  else if (g.is_conference)  score += 12
  else                       score += 4

  // 6. Fan travel (15 pts)
  if (g.travel_rate >= HIGH_TRAVEL_THRESHOLD) score += 15
  else                                         score += Math.round(g.travel_rate / HIGH_TRAVEL_THRESHOLD * 15)

  return Math.min(100, Math.max(0, score))
}

function scoreToOutput(score: number, game?: Partial<GameData>) {
  let tier: string
  let multiplier: number
  let releaseDays: number
  let passLimit: number | null
  let ambassadorBoost: number

  if (score >= 80) {
    tier = 'marquee'; multiplier = 1.5; releaseDays = 14; passLimit = 200; ambassadorBoost = 5
  } else if (score >= 60) {
    tier = 'marquee'; multiplier = 1.25; releaseDays = 7; passLimit = 300; ambassadorBoost = 3
  } else if (score >= 40) {
    tier = 'standard'; multiplier = 1.0; releaseDays = 3; passLimit = null; ambassadorBoost = 0
  } else {
    tier = 'slow'; multiplier = 0.85; releaseDays = 1; passLimit = null; ambassadorBoost = 0
  }

  return {
    recommended_tier:             tier,
    price_multiplier:             multiplier,
    recommended_release_days_out: releaseDays,
    recommended_pass_limit:       passLimit,
    ambassador_incentive_boost:   ambassadorBoost,
  }
}

function buildBaseline(date: string) {
  const dow = new Date(date).getDay()
  const isWeekend = dow === 5 || dow === 6
  return scoreToOutput(isWeekend ? 45 : 25)
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function upsertDemandEvent(
  supabase:  any,
  venue_id:  string,
  date:      string,
  data:      Record<string, any>
) {
  await supabase
    .from('demand_events')
    .upsert({
      event_date:                    date,
      venue_id,
      home_team:                     data.home_team        ?? null,
      away_team:                     data.away_team        ?? null,
      home_record:                   data.home_record      ?? null,
      away_record:                   data.away_record      ?? null,
      home_rank:                     data.home_rank        ?? null,
      away_rank:                     data.away_rank        ?? null,
      spread:                        data.spread           ?? null,
      total:                         data.total            ?? null,
      game_time:                     data.game_time        ?? null,
      is_rivalry:                    data.is_rivalry       ?? false,
      is_conference:                 data.is_conference    ?? false,
      neutral_site:                  data.neutral_site     ?? false,
      demand_score:                  data.demand_score     ?? 50,
      recommended_tier:              data.recommended_tier ?? 'standard',
      price_multiplier:              data.price_multiplier ?? 1.0,
      recommended_release_days_out:  data.recommended_release_days_out ?? 3,
      recommended_pass_limit:        data.recommended_pass_limit       ?? null,
      ambassador_incentive_boost:    data.ambassador_incentive_boost   ?? 0,
      fetched_at:                    new Date().toISOString(),
    }, { onConflict: 'event_date,venue_id' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
