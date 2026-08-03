'use client'
/**
 * DemandScoreCard
 *
 * Displays the demand score and recommendations for a given date.
 * Used in the operator dashboard and bar admin event planning view.
 */

import { useEffect, useState } from 'react'

interface DemandData {
  demand_score:                  number
  recommended_tier:              string
  price_multiplier:              number
  recommended_release_days_out:  number
  recommended_pass_limit:        number | null
  ambassador_incentive_boost:    number
  home_team?:                    string
  away_team?:                    string
  home_rank?:                    number | null
  away_rank?:                    number | null
  home_record?:                  string | null
  away_record?:                  string | null
  spread?:                       number | null
  total?:                        number | null
  game_time?:                    string
  is_rivalry?:                   boolean
  is_conference?:                boolean
  game_found?:                   boolean
  cached?:                       boolean
}

interface Props {
  venueId: string
  date:    string            // YYYY-MM-DD
  baseFullVenueCents: number // to show recommended price
}

const SCORE_LABELS = [
  { min: 80, label: 'Massive night', color: '#E24B4A' },
  { min: 60, label: 'Big game', color: 'var(--bw-gold)' },
  { min: 40, label: 'Standard night', color: 'var(--bw-text)' },
  { min: 0,  label: 'Quiet night', color: 'var(--bw-muted)' },
]

function getScoreLabel(score: number) {
  return SCORE_LABELS.find(s => score >= s.min) ?? SCORE_LABELS[3]
}

export default function DemandScoreCard({ venueId, date, baseFullVenueCents }: Props) {
  const [data,    setData]    = useState<DemandData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/demand/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ venue_id: venueId, date }),
    })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [venueId, date])

  if (loading) return (
    <div className="card" style={{ padding: '20px', color: 'var(--bw-muted)', fontSize: 13 }}>
      Analyzing demand for {date}…
    </div>
  )

  if (error || !data) return (
    <div className="card" style={{ padding: '20px', color: 'var(--bw-red)', fontSize: 13 }}>
      Failed to load demand data.
    </div>
  )

  const { label, color } = getScoreLabel(data.demand_score)
  const recommendedPrice = Math.round(baseFullVenueCents * data.price_multiplier)
  const circumference    = 2 * Math.PI * 36
  const dashOffset       = circumference * (1 - data.demand_score / 100)
  const releaseDate      = new Date(date)
  releaseDate.setDate(releaseDate.getDate() - data.recommended_release_days_out)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 4 }}>
            Demand score · {date}
            {data.cached && <span style={{ color: 'var(--bw-muted)', fontWeight: 400, marginLeft: 6 }}>cached</span>}
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.04em', color, lineHeight: 1 }}>
            {label}
          </div>
        </div>

        {/* Circular score gauge */}
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="36" fill="none" stroke="var(--bw-border)" strokeWidth="6"/>
          <circle cx="44" cy="44" r="36" fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
          <text x="44" y="44" textAnchor="middle" dominantBaseline="central"
            style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, fill: color, letterSpacing: '0.02em' }}>
            {data.demand_score}
          </text>
        </svg>
      </div>

      {/* Game info */}
      {data.game_found && data.home_team && (
        <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-text)', marginBottom: 4 }}>
            {data.away_rank ? `#${data.away_rank} ` : ''}{data.away_team}
            {' '}<span style={{ color: 'var(--bw-muted)', fontWeight: 400 }}>@</span>{' '}
            {data.home_rank ? `#${data.home_rank} ` : ''}{data.home_team}
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.game_time && <span>⏰ {data.game_time}</span>}
            {data.away_record && data.home_record && (
              <span>{data.away_record} vs {data.home_record}</span>
            )}
            {data.spread !== null && data.spread !== undefined && (
              <span>Spread: {data.spread > 0 ? '+' : ''}{data.spread}</span>
            )}
            {data.total !== null && data.total !== undefined && (
              <span>O/U: {data.total}</span>
            )}
            {data.is_rivalry  && <span style={{ color: '#E24B4A', fontWeight: 700 }}>🏆 Rivalry</span>}
            {data.is_conference && !data.is_rivalry && <span style={{ color: 'var(--bw-gold)', fontWeight: 700 }}>SEC</span>}
          </div>
        </div>
      )}

      {!data.game_found && (
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 14 }}>
          No home game this week — pricing based on day-of-week baseline.
        </div>
      )}

      {/* Recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Night tier',       value: data.recommended_tier.replace('_', ' ') },
          { label: 'Price multiplier', value: `${data.price_multiplier}×` },
          { label: 'Full venue price', value: `$${(recommendedPrice / 100).toFixed(0)}` },
          { label: 'Release date',     value: releaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
          { label: 'Pass cap',         value: data.recommended_pass_limit ? `${data.recommended_pass_limit} max` : 'No cap' },
          { label: 'Ambassador boost', value: data.ambassador_incentive_boost > 0 ? `+${data.ambassador_incentive_boost}% commission` : 'Standard' },
        ].map(r => (
          <div key={r.label} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)' }}>{r.value}</div>
          </div>
        ))}
      </div>

      {data.ambassador_incentive_boost > 0 && (
        <div style={{ background: 'rgba(245,184,0,0.08)', border: '1px solid rgba(245,184,0,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--bw-gold)' }}>
          🚀 High-demand night — ambassador commission boosted +{data.ambassador_incentive_boost}% to drive early sales
        </div>
      )}
    </div>
  )
}
