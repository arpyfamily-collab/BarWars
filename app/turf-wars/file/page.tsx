'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { Shield, Crosshair, Swords, MapPin, Clock, Users, AlertCircle } from 'lucide-react'

type ClaimType = 'initial_claim' | 'sneak_attack' | 'war_declaration'

interface Bar {
  id: string
  name: string
  turf_enabled: boolean
  turf_holder_name?: string
}

export default function FileClaimPage() {
  const router = useRouter()
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [claimType, setClaimType] = useState<ClaimType>('initial_claim')
  const [selectedBar, setSelectedBar] = useState<string>('')
  const [windowDate, setWindowDate] = useState('')
  const [windowStart, setWindowStart] = useState('20:00')
  const [windowEnd, setWindowEnd] = useState('22:00')
  const [headcount, setHeadcount] = useState(10)
  const [isRushEvent, setIsRushEvent] = useState(false)

  useEffect(() => {
    fetch('/api/turf-wars/map')
      .then(r => r.json())
      .then(d => {
        setBars(Array.isArray(d) ? d.filter((b: any) => b.turf_enabled).map((b: any) => ({
          id: b.bar_id,
          name: b.bar_name,
          turf_enabled: b.turf_enabled,
          turf_holder_name: b.turf_holder_name ?? undefined,
        })) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectedBarData = bars.find(b => b.id === selectedBar)

  function getTomorrowDate(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }

  async function submitClaim() {
    if (!selectedBar) { setError('Select a bar'); return }
    if (!windowDate) { setError('Pick a date'); return }

    const startISO = new Date(`${windowDate}T${windowStart}:00`).toISOString()
    const endISO = new Date(`${windowDate}T${windowEnd}:00`).toISOString()
    const now = new Date()

    if (new Date(startISO) <= now) { setError('Window must be in the future'); return }
    if (new Date(endISO) <= new Date(startISO)) { setError('End must be after start'); return }

    const durationHrs = (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000
    if (durationHrs < 2) { setError('Window must be at least 2 hours'); return }
    if (durationHrs > 4) { setError('Window cannot exceed 4 hours'); return }

    const dayOfWeek = new Date(startISO).getDay()
    if (claimType === 'sneak_attack' && (dayOfWeek < 1 || dayOfWeek > 4)) {
      setError('Sneak attacks can only be scheduled Monday through Thursday'); return
    }
    if (claimType === 'war_declaration' && dayOfWeek !== 5 && dayOfWeek !== 6) {
      setError('War declarations can only be scheduled on Friday or Saturday'); return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/turf-wars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_type: claimType,
          bar_id: selectedBar,
          window_open_at: startISO,
          window_close_at: endISO,
          required_headcount: headcount,
          is_rush_event: isRushEvent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const isPendingApproval = (data as any).status === 'operator_pending'
      router.push(isPendingApproval
        ? '/turf-wars?msg=war-pending'
        : `/turf-wars?msg=claim-filed`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const claimTypes: { type: ClaimType; label: string; icon: typeof Shield; desc: string }[] = [
    { type: 'initial_claim', label: 'Initial Claim', icon: Shield, desc: 'Claim a neutral bar. 72hr public notice.' },
    { type: 'sneak_attack', label: 'Sneak Attack', icon: Crosshair, desc: 'Strike a held bar. Mon–Thu only. Detection at 50%.' },
    { type: 'war_declaration', label: 'War Declaration', icon: Swords, desc: 'Public showdown. Fri–Sat. Requires operator approval.' },
  ]

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer', marginBottom: 12 }} onClick={() => router.back()}>← Turf Wars</div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>File a Claim</div>
      </div>

      <div className="page-content">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}

        {/* Claim type selector */}
        <div>
          <label>Claim Type</label>
          <div className="stack stack-sm">
            {claimTypes.map(ct => {
              const Icon = ct.icon
              const active = claimType === ct.type
              return (
                <div
                  key={ct.type}
                  onClick={() => { setClaimType(ct.type); setError(null) }}
                  style={{
                    background: active ? 'rgba(245,184,0,0.08)' : 'var(--bw-card)',
                    border: `1px solid ${active ? 'var(--bw-gold)' : 'var(--bw-border)'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <Icon size={18} style={{ color: active ? 'var(--bw-gold)' : 'var(--bw-muted)' }} />
                    <span style={{ fontWeight: 600, fontSize: 15, color: active ? 'var(--bw-gold)' : 'var(--bw-text)' }}>{ct.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{ct.desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bar selector */}
        <div>
          <label>Target Bar</label>
          {bars.length === 0 ? (
            <div className="card" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>No bars have turf wars enabled yet.</div>
          ) : (
            <div className="stack stack-sm">
              {bars.map(bar => (
                <div
                  key={bar.id}
                  onClick={() => { setSelectedBar(bar.id); setError(null) }}
                  style={{
                    background: selectedBar === bar.id ? 'rgba(245,184,0,0.08)' : 'var(--bw-card)',
                    border: `1px solid ${selectedBar === bar.id ? 'var(--bw-gold)' : 'var(--bw-border)'}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={16} style={{ color: 'var(--bw-muted)' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{bar.name}</div>
                      {bar.turf_holder_name && (
                        <div style={{ fontSize: 11, color: 'var(--bw-gold)' }}>Held by {bar.turf_holder_name}</div>
                      )}
                    </div>
                  </div>
                  {selectedBar === bar.id && <span style={{ color: 'var(--bw-gold)', fontSize: 12 }}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Window config */}
        <div>
          <label>Battle Date</label>
          <input
            type="date"
            className="input"
            value={windowDate || getTomorrowDate()}
            onChange={e => setWindowDate(e.target.value)}
            min={getTomorrowDate()}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Start Time</label>
            <input type="time" className="input" value={windowStart} onChange={e => setWindowStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>End Time</label>
            <input type="time" className="input" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <label>Required Headcount</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={3}
              max={40}
              value={headcount}
              onChange={e => setHeadcount(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--bw-gold)' }}
            />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-gold)', minWidth: 44, textAlign: 'right' }}>
              {headcount}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4 }}>
            Minimum verified members that must check in during the battle window
          </div>
        </div>

        {/* Rush event toggle */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>Rush Event</div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                Designate this as a rush event. Rushees who attend as allies earn a Rush Credential.
              </div>
            </div>
            <button
              onClick={() => setIsRushEvent(!isRushEvent)}
              style={{
                width: 50, height: 28, borderRadius: 14,
                background: isRushEvent ? 'var(--bw-gold)' : 'var(--bw-border)',
                border: 'none', cursor: 'pointer', position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: isRushEvent ? 25 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </div>

        {/* Summary */}
        {selectedBarData && (
          <div className="card" style={{ background: 'var(--bw-surface)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
              Summary
            </div>
            <div className="stack stack-sm">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <MapPin size={14} style={{ color: 'var(--bw-muted)' }} /> {selectedBarData.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Clock size={14} style={{ color: 'var(--bw-muted)' }} /> {windowStart} – {windowEnd}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Users size={14} style={{ color: 'var(--bw-muted)' }} /> {headcount} verified members needed
              </div>
              {claimType === 'war_declaration' && (
                <div style={{ fontSize: 12, color: 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={12} /> Requires operator approval before going live
                </div>
              )}
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={submitClaim} disabled={submitting || !selectedBar}>
          {submitting ? 'Filing…' : 'File Claim'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
