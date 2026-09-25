'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/BottomNav'
import { Eye, TrendingUp, Trophy, Check, Clock, Target, BarChart3 } from 'lucide-react'

type PredictionType = 'daily_dropper' | 'weekly_over_under' | 'season_most_drops'

interface Venue {
  id: string
  name: string
}

interface Prediction {
  id: string
  prediction_type: PredictionType
  target_venue_id: string | null
  guess_value: string | null
  prediction_date: string
  result: 'win' | 'loss' | null
  payout_bonds: number
  created_at: string
  venues: { name: string } | null
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function getMondayStr(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

const PREDICTION_TYPE_LABELS: Record<PredictionType, string> = {
  daily_dropper: 'Daily Dropper',
  weekly_over_under: 'Weekly O/U',
  season_most_drops: 'Season Futures',
}

export default function PredictionsPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [weeklyLine, setWeeklyLine] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<PredictionType | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Selections
  const [dailySelected, setDailySelected] = useState<string | null>(null)
  const [overUnderSelected, setOverUnderSelected] = useState<'over' | 'under' | null>(null)
  const [seasonSelected, setSeasonSelected] = useState<string | null>(null)

  // Existing predictions for today/this week
  const [dailyExisting, setDailyExisting] = useState<Prediction | null>(null)
  const [weeklyExisting, setWeeklyExisting] = useState<Prediction | null>(null)
  const [seasonExisting, setSeasonExisting] = useState<Prediction | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch venues
    const { data: venueData } = await supabase
      .from('venues')
      .select('id, name')
      .order('name')

    setVenues((venueData as Venue[]) ?? [])

    if (!user) {
      setLoading(false)
      return
    }

    const today = getTodayStr()
    const monday = getMondayStr()

    // Fetch weekly line
    const { data: line } = await supabase
      .from('prediction_lines')
      .select('line_value')
      .eq('prediction_type', 'weekly_over_under')
      .eq('prediction_date', monday)
      .maybeSingle()

    setWeeklyLine(line?.line_value ?? null)

    // Fetch existing predictions
    const { data: dailyPred } = await supabase
      .from('predictions')
      .select(`
        id, prediction_type, target_venue_id, guess_value, prediction_date,
        result, payout_bonds, created_at,
        venues:target_venue_id(name)
      `)
      .eq('user_id', user.id)
      .eq('prediction_type', 'daily_dropper')
      .eq('prediction_date', today)
      .maybeSingle()

    setDailyExisting((dailyPred as unknown as Prediction) ?? null)

    const { data: weeklyPred } = await supabase
      .from('predictions')
      .select(`
        id, prediction_type, target_venue_id, guess_value, prediction_date,
        result, payout_bonds, created_at,
        venues:target_venue_id(name)
      `)
      .eq('user_id', user.id)
      .eq('prediction_type', 'weekly_over_under')
      .eq('prediction_date', monday)
      .maybeSingle()

    setWeeklyExisting((weeklyPred as unknown as Prediction) ?? null)

    const { data: seasonPred } = await supabase
      .from('predictions')
      .select(`
        id, prediction_type, target_venue_id, guess_value, prediction_date,
        result, payout_bonds, created_at,
        venues:target_venue_id(name)
      `)
      .eq('user_id', user.id)
      .eq('prediction_type', 'season_most_drops')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setSeasonExisting((seasonPred as unknown as Prediction) ?? null)

    // Fetch recent predictions
    const { data: recent } = await supabase
      .from('predictions')
      .select(`
        id, prediction_type, target_venue_id, guess_value, prediction_date,
        result, payout_bonds, created_at,
        venues:target_venue_id(name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    setPredictions((recent as unknown as Prediction[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const submitPrediction = async (
    type: PredictionType,
    body: { target_venue_id?: string; guess_value?: string }
  ) => {
    setSubmitting(type)
    setError(null)

    const predictionDate = type === 'weekly_over_under' ? getMondayStr() : getTodayStr()

    try {
      const res = await fetch('/api/predictions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prediction_type: type,
          prediction_date: predictionDate,
          ...body,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to submit prediction')
      } else {
        loadData()
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setSubmitting(null)
    }
  }

  const renderPillButtons = (
    selected: string | null,
    onSelect: (id: string) => void,
    accentColor: string,
    glowColor: string
  ) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {venues.map((v) => {
        const isSelected = selected === v.id
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            style={{
              background: isSelected ? glowColor : 'var(--bw-surface)',
              border: `1px solid ${isSelected ? accentColor : 'var(--bw-border)'}`,
              borderRadius: 20,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: isSelected ? accentColor : 'var(--bw-text)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {v.name}
          </button>
        )
      })}
    </div>
  )

  const cardHeaderStyle = (accentColor: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--bw-text)',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottom: '1px solid var(--bw-border)',
  })

  const submitButtonStyle = (bgColor: string, disabled: boolean): React.CSSProperties => ({
    background: disabled ? 'var(--bw-surface)' : bgColor,
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: disabled ? 'var(--bw-muted)' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s',
    width: '100%',
  })

  const lockedInStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    padding: '12px',
    borderRadius: 8,
    background: 'rgba(46,204,113,0.08)',
    border: '1px solid rgba(46,204,113,0.25)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--bw-green)',
  }

  const pendingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    padding: '12px',
    borderRadius: 8,
    background: 'var(--bw-violet-glow)',
    border: '1px solid rgba(123,44,191,0.3)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--bw-violet-soft)',
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading intel&#8230;
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          WAR ROOM INTEL
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Predict the battlefield. Earn Valor Bonds.
        </div>
      </div>

      <div className="page-content">

        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)' }}>{error}</div>
          </div>
        )}

        {/* ── Card A: Daily Dropper ─────────────────────────────────── */}
        <div className="card" style={{ borderLeft: '3px solid var(--bw-violet)', marginBottom: 16 }}>
          <div style={cardHeaderStyle('var(--bw-violet)')}>
            <Target size={16} style={{ color: 'var(--bw-violet)' }} />
            Which bar dropped bracelets today?
          </div>

          {dailyExisting ? (
            <div style={dailyExisting.result ? lockedInStyle : pendingStyle}>
              {dailyExisting.result === 'win' ? (
                <>
                  <Check size={16} /> Won &#8212; {dailyExisting.payout_bonds} Valor Bonds
                </>
              ) : dailyExisting.result === 'loss' ? (
                <>
                  <Trophy size={16} /> Missed &#8212; better luck tomorrow
                </>
              ) : (
                <>
                  <Clock size={16} /> Locked in: {dailyExisting.venues?.name ?? 'Unknown'} &#8212; waiting for results
                </>
              )}
            </div>
          ) : (
            <>
              {renderPillButtons(dailySelected, setDailySelected, 'var(--bw-violet)', 'var(--bw-violet-glow)')}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => dailySelected && submitPrediction('daily_dropper', { target_venue_id: dailySelected })}
                  disabled={!dailySelected || submitting === 'daily_dropper'}
                  style={submitButtonStyle('var(--bw-violet)', !dailySelected || submitting === 'daily_dropper')}
                >
                  {submitting === 'daily_dropper' ? 'Locking in&#8230;' : 'Lock in guess'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Card B: Weekly Over/Under ────────────────────────────── */}
        <div className="card" style={{ borderLeft: '3px solid var(--bw-cyan)', marginBottom: 16 }}>
          <div style={cardHeaderStyle('var(--bw-cyan)')}>
            <BarChart3 size={16} style={{ color: 'var(--bw-cyan)' }} />
            Total bracelet drops this week: over or under?
          </div>

          {weeklyLine === null ? (
            <div style={{ fontSize: 13, color: 'var(--bw-muted)', textAlign: 'center', padding: '16px 0' }}>
              Line not set yet &#8212; check back Monday
            </div>
          ) : weeklyExisting ? (
            <div style={weeklyExisting.result ? lockedInStyle : pendingStyle}>
              {weeklyExisting.result === 'win' ? (
                <>
                  <Check size={16} /> Won &#8212; {weeklyExisting.payout_bonds} Valor Bonds
                </>
              ) : weeklyExisting.result === 'loss' ? (
                <>
                  <Trophy size={16} /> Missed &#8212; the line was {weeklyLine}
                </>
              ) : (
                <>
                  <Clock size={16} /> Locked in: {weeklyExisting.guess_value?.toUpperCase()} {weeklyLine} &#8212; waiting for results
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, letterSpacing: '0.04em', color: 'var(--bw-cyan)', lineHeight: 1 }}>
                  {weeklyLine}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  The Line
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['over', 'under'] as const).map((choice) => {
                  const isSelected = overUnderSelected === choice
                  return (
                    <button
                      key={choice}
                      onClick={() => setOverUnderSelected(choice)}
                      style={{
                        flex: 1,
                        background: isSelected ? 'var(--bw-cyan-glow)' : 'var(--bw-surface)',
                        border: `1px solid ${isSelected ? 'var(--bw-cyan)' : 'var(--bw-border)'}`,
                        borderRadius: 8,
                        padding: '14px',
                        fontSize: 15,
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: isSelected ? 'var(--bw-cyan)' : 'var(--bw-text)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => overUnderSelected && submitPrediction('weekly_over_under', { guess_value: overUnderSelected })}
                  disabled={!overUnderSelected || submitting === 'weekly_over_under'}
                  style={submitButtonStyle('var(--bw-cyan)', !overUnderSelected || submitting === 'weekly_over_under')}
                >
                  {submitting === 'weekly_over_under' ? 'Locking in&#8230;' : 'Lock in guess'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Card C: Season Futures ───────────────────────────────── */}
        <div className="card" style={{ borderLeft: '3px solid var(--bw-yellow)', marginBottom: 16 }}>
          <div style={cardHeaderStyle('var(--bw-yellow)')}>
            <Trophy size={16} style={{ color: 'var(--bw-yellow)' }} />
            Which bar will have the most drops by semester end?
          </div>

          {seasonExisting ? (
            <div style={seasonExisting.result ? lockedInStyle : pendingStyle}>
              {seasonExisting.result === 'win' ? (
                <>
                  <Check size={16} /> Won &#8212; {seasonExisting.payout_bonds} Valor Bonds
                </>
              ) : seasonExisting.result === 'loss' ? (
                <>
                  <Trophy size={16} /> Wrong call &#8212; {seasonExisting.venues?.name} didn&apos;t lead
                </>
              ) : (
                <>
                  <Clock size={16} /> Future placed: {seasonExisting.venues?.name ?? 'Unknown'} &#8212; resolves at semester end
                </>
              )}
            </div>
          ) : (
            <>
              {renderPillButtons(seasonSelected, setSeasonSelected, 'var(--bw-yellow)', 'var(--bw-yellow-glow)')}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => seasonSelected && submitPrediction('season_most_drops', { target_venue_id: seasonSelected })}
                  disabled={!seasonSelected || submitting === 'season_most_drops'}
                  style={submitButtonStyle('var(--bw-yellow)', !seasonSelected || submitting === 'season_most_drops')}
                >
                  {submitting === 'season_most_drops' ? 'Placing&#8230;' : 'Place future'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Recent predictions ───────────────────────────────────── */}
        {predictions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
              Your recent predictions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {predictions.map((p) => {
                const icon = p.prediction_type === 'daily_dropper' ? <Target size={14} />
                  : p.prediction_type === 'weekly_over_under' ? <BarChart3 size={14} />
                  : <Trophy size={14} />

                const guessLabel = p.prediction_type === 'weekly_over_under'
                  ? `${p.guess_value?.toUpperCase()} ${weeklyLine ?? ''}`.trim()
                  : p.venues?.name ?? 'Unknown'

                const resultColor = p.result === 'win' ? 'var(--bw-yellow)'
                  : p.result === 'loss' ? 'var(--bw-muted)'
                  : 'var(--bw-violet-soft)'

                const resultLabel = p.result === 'win' ? `Win +${p.payout_bonds}`
                  : p.result === 'loss' ? 'Loss'
                  : 'Pending'

                return (
                  <div key={p.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ color: 'var(--bw-muted)', flexShrink: 0 }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bw-text)' }}>
                        {PREDICTION_TYPE_LABELS[p.prediction_type]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--bw-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {guessLabel}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: resultColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {resultLabel}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Leaderboard link ─────────────────────────────────────── */}
        <Link
          href="/predictions/leaderboard"
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', fontSize: 13, textDecoration: 'none', padding: '12px' }}
        >
          <Trophy size={16} />
          View War Analyst Leaderboard
        </Link>

      </div>
      <BottomNav />
    </div>
  )
}
