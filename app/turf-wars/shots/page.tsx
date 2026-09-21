'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Crosshair, AlertCircle, Clock, Flame, DollarSign, Gauge } from 'lucide-react'

interface Bar {
  bar_id: string
  bar_name: string
  threat_level: string
  turf_enabled: boolean
  turf_holder_name: string | null
}

interface RateLimitInfo {
  sneak_attacks_remaining: number
  cooldown_bars: string[]
}

export default function FireShotsPage() {
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBar, setSelectedBar] = useState('')
  const [shotsCount, setShotsCount] = useState(10)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [surgeFee, setSurgeFee] = useState(0)

  useEffect(() => {
    fetch('/api/turf-wars/map')
      .then(r => r.json())
      .then(d => {
        const turfBars = Array.isArray(d) ? d.filter((b: any) => b.turf_enabled && b.turf_holder_name) : []
        setBars(turfBars)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function selectBar(barId: string) {
    setSelectedBar(barId)
    setError(null)
    // Fetch bar details to get surge fee
    const bar = bars.find(b => b.bar_id === barId)
    if (bar) {
      fetch(`/api/bar-admin/turf-config?bar_id=${barId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && !d.error) setSurgeFee(d.turf_surge_fee_cents ?? 0)
        })
        .catch(() => {})
    }
  }

  async function fireShots() {
    if (!selectedBar) { setError('Select a bar to fire shots at'); return }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/turf-wars/shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bar_id: selectedBar, shots_count: shotsCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const surgeNote = data.surge_fee_required
        ? ` Surge fee of $${(data.surge_fee_cents / 100).toFixed(2)} charged to your org.`
        : ''
      setSuccess(`Shots fired! The bar admin must confirm. Attack window opens 1-3 hours after confirmation.${surgeNote}`)
      setSelectedBar('')
      setSurgeFee(0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Fire Shots</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>Signal a sneak attack. Weekdays only.</div>
      </div>

      <div className="page-content">
        {success && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-green)' }}>{success}</div>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            How Shots Fired Works
          </div>
          <div className="stack stack-sm" style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.6 }}>
            <div>1. Your org buys drinks at the bar (minimum set by the bar).</div>
            <div>2. Bar admin confirms — 4-hour advance notice gives them time to staff up.</div>
            <div>3. Attack window opens 1-3 hours after confirmation. Both orgs get a push.</div>
            <div>4. 90-minute headcount race. Check in via QR or geo-pulse.</div>
            <div>5. Back down without attacking? Public credibility hit + you lose 50% of the surge fee.</div>
          </div>
        </div>

        {/* Rate limits */}
        <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Gauge size={16} style={{ color: 'var(--bw-gold)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>
              Rate Limits
            </span>
          </div>
          <div className="stack stack-sm" style={{ fontSize: 12, color: 'var(--bw-text)' }}>
            <div>3 sneak attacks per org per 30-day rolling period</div>
            <div>1 attack per bar per 14 days (cooldown applies win or lose)</div>
            <div>Stand-downs count as a used attack — no bluffing for free</div>
          </div>
        </div>

        {/* Bar selector — only bars held by another org */}
        <div>
          <label>Target Bar (held territory only)</label>
          {bars.length === 0 ? (
            <div className="card" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              No held bars available to attack. Wait for orgs to claim turf first.
            </div>
          ) : (
            <div className="stack stack-sm">
              {bars.map(bar => (
                <div
                  key={bar.bar_id}
                  onClick={() => selectBar(bar.bar_id)}
                  style={{
                    background: selectedBar === bar.bar_id ? 'rgba(224,49,49,0.08)' : 'var(--bw-card)',
                    border: `1px solid ${selectedBar === bar.bar_id ? '#E03131' : 'var(--bw-border)'}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{bar.bar_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--bw-gold)' }}>Held by {bar.turf_holder_name}</div>
                  </div>
                  {bar.threat_level !== 'quiet' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#E03131', textTransform: 'uppercase' }}>
                      {bar.threat_level.replace('_', ' ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shots count */}
        <div>
          <label>Shots Purchased</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={6}
              max={30}
              value={shotsCount}
              onChange={e => setShotsCount(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: '#E03131' }}
            />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#E03131', minWidth: 44, textAlign: 'right' }}>
              {shotsCount}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4 }}>
            Minimum is set by each bar. Higher count = stronger signal.
          </div>
        </div>

        {/* Surge fee display */}
        {surgeFee > 0 && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <DollarSign size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>
                Surge Event Fee
              </span>
            </div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-gold)' }}>
              ${(surgeFee / 100).toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Charged to your org at filing. Goes directly to the bar for staffing.
              If you stand down, 50% is refunded. If you follow through, the full fee is committed.
            </div>
          </div>
        )}

        <button className="btn btn-danger" onClick={fireShots} disabled={submitting || !selectedBar}>
          <Crosshair size={18} />
          {submitting ? 'Firing…' : surgeFee > 0 ? `Fire Shots — $${(surgeFee / 100).toFixed(0)}` : 'Fire Shots'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
