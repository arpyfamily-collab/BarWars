'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Settings, AlertCircle, Check, Crosshair, Shield } from 'lucide-react'

interface BarConfig {
  id: string
  name: string
  turf_enabled: boolean
  turf_claim_headcount_pct: number
  turf_maintenance_headcount_pct: number
  turf_sneak_attack_headcount_pct: number
  turf_shots_min: number
  turf_sneak_attack_nights: number[]
  turf_war_nights: number[]
  turf_maintenance_nights_required: number
  turf_surge_fee_cents: number
}

interface PendingShot {
  id: string
  status: string
  shots_count: number
  surge_fee_cents: number
  org: { name: string } | null
  org_name?: string
  created_at: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function BarAdminTurfPage() {
  const [config, setConfig] = useState<BarConfig | null>(null)
  const [pendingShots, setPendingShots] = useState<PendingShot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/bar-admin/turf-config').then(r => r.json()),
      fetch('/api/turf-wars/shots?status=pending').then(r => r.json()),
    ]).then(([cfg, shots]) => {
      if (cfg && !cfg.error) setConfig(cfg)
      if (Array.isArray(shots)) setPendingShots(shots.filter((s: any) => s.status === 'pending_confirmation'))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function saveConfig() {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/bar-admin/turf-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Turf settings saved.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmShot(shotId: string, action: 'confirm' | 'deny') {
    try {
      const res = await fetch(`/api/turf-wars/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPendingShots(prev => prev.filter(s => s.id !== shotId))
    } catch (e: any) {
      setError(e.message)
    }
  }

  function toggleNight(arr: number[], day: number): number[] {
    return arr.includes(day) ? arr.filter(d => d !== day) : [...arr, day]
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>
  if (!config) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>You are not a bar admin.</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={22} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, letterSpacing: '0.04em' }}>Turf Settings</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>{config.name}</div>
      </div>

      <div className="page-content">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}
        {success && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} />{success}
            </div>
          </div>
        )}

        {/* Pending shots */}
        {pendingShots.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E03131', marginBottom: 12 }}>
              Pending Shots — Confirm or Deny
            </div>
            <div className="stack stack-sm">
              {pendingShots.map(shot => (
                <div key={shot.id} className="card" style={{ borderLeft: '3px solid #E03131' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Crosshair size={16} style={{ color: '#E03131' }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{shot.org?.name ?? shot.org_name ?? 'Unknown org'}</span>
                    <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>· {shot.shots_count} shots</span>
                  </div>
                  {shot.surge_fee_cents > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginBottom: 8 }}>
                      Surge fee: ${(shot.surge_fee_cents / 100).toFixed(2)} paid to your bar
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 8 }}>
                    Filed {new Date(shot.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => confirmShot(shot.id, 'confirm')}>Confirm</button>
                    <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, color: 'var(--bw-red)', borderColor: 'rgba(224,49,49,0.3)' }} onClick={() => confirmShot(shot.id, 'deny')}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enable toggle */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>Enable Turf Wars</div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Allow Greek orgs to claim and battle over your bar</div>
            </div>
            <button
              onClick={() => setConfig({ ...config, turf_enabled: !config.turf_enabled })}
              style={{
                width: 50, height: 28, borderRadius: 14,
                background: config.turf_enabled ? 'var(--bw-green)' : 'var(--bw-border)',
                border: 'none', cursor: 'pointer', position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: config.turf_enabled ? 25 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </div>

        {/* Headcount thresholds */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
            Headcount Thresholds (% of org roster)
          </div>
          <div className="stack stack-sm">
            <ThresholdSlider label="Initial Claim" value={config.turf_claim_headcount_pct} onChange={v => setConfig({ ...config, turf_claim_headcount_pct: v })} />
            <ThresholdSlider label="Maintenance" value={config.turf_maintenance_headcount_pct} onChange={v => setConfig({ ...config, turf_maintenance_headcount_pct: v })} />
            <ThresholdSlider label="Sneak Attack" value={config.turf_sneak_attack_headcount_pct} onChange={v => setConfig({ ...config, turf_sneak_attack_headcount_pct: v })} />
          </div>
        </div>

        {/* Minimum shots */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
            Minimum Shots to Fire
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={3} max={25} value={config.turf_shots_min} onChange={e => setConfig({ ...config, turf_shots_min: parseInt(e.target.value) })} style={{ flex: 1, accentColor: 'var(--bw-gold)' }} />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-gold)', minWidth: 40, textAlign: 'right' }}>{config.turf_shots_min}</div>
          </div>
        </div>

        {/* Surge Event Fee */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
            Surge Event Fee
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--bw-muted)' }}>$</span>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={config.turf_surge_fee_cents / 100}
              onChange={e => setConfig({ ...config, turf_surge_fee_cents: parseInt(e.target.value) * 100 })}
              style={{ flex: 1, accentColor: 'var(--bw-gold)' }}
            />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-gold)', minWidth: 56, textAlign: 'right' }}>
              ${(config.turf_surge_fee_cents / 100).toFixed(0)}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4, lineHeight: 1.5 }}>
            Flat fee the attacking org pays when firing shots. Goes to your bar for staffing.
            Set to $0 for no fee. On stand-down, the org gets 50% back — you keep 50% for the inconvenience.
          </div>
        </div>

        {/* Eligible nights */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
            Eligible Nights
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bw-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={13} style={{ color: '#E03131' }} /> Sneak Attack Nights
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  onClick={() => setConfig({ ...config, turf_sneak_attack_nights: toggleNight(config.turf_sneak_attack_nights, i) })}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: config.turf_sneak_attack_nights.includes(i) ? 'rgba(224,49,49,0.15)' : 'var(--bw-surface)',
                    color: config.turf_sneak_attack_nights.includes(i) ? '#E03131' : 'var(--bw-muted)',
                    border: `1px solid ${config.turf_sneak_attack_nights.includes(i) ? 'rgba(224,49,49,0.3)' : 'var(--bw-border)'}`,
                  }}
                >{day}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bw-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={13} style={{ color: 'var(--bw-gold)' }} /> War Declaration Nights
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  onClick={() => setConfig({ ...config, turf_war_nights: toggleNight(config.turf_war_nights, i) })}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: config.turf_war_nights.includes(i) ? 'rgba(245,184,0,0.15)' : 'var(--bw-surface)',
                    color: config.turf_war_nights.includes(i) ? 'var(--bw-gold)' : 'var(--bw-muted)',
                    border: `1px solid ${config.turf_war_nights.includes(i) ? 'rgba(245,184,0,0.3)' : 'var(--bw-border)'}`,
                  }}
                >{day}</button>
              ))}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}

function ThresholdSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: 'var(--bw-text)' }}>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--bw-gold)' }}>{value}%</span>
      </div>
      <input type="range" min={5} max={50} value={value} onChange={e => onChange(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--bw-gold)' }} />
    </div>
  )
}
