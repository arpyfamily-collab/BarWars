'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type ClaimStatus = 'pending' | 'operator_pending' | 'live' | 'successful' | 'failed' | 'contested' | 'cancelled'

interface TurfClaimDetail {
  id: string
  claim_type: string
  status: ClaimStatus
  window_open_at: string
  window_close_at: string
  required_headcount: number
  attacker_verified_headcount: number
  defender_verified_headcount: number
  detection_threshold: number
  detected_at: string | null
  rally_window_minutes: number
  lockout_days: number
  cancel_reason: string | null
  result: string | null
  created_at: string
  attacking_org: { name: string; org_type: string }
  defending_org: { name: string; org_type: string } | null
  bar: { id: string; name: string }
  checkins: Array<{ org_id: string; verified_at: string }>
}

export default function TurfClaimDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [claim, setClaim]       = useState<TurfClaimDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [action, setAction]     = useState<'approve' | 'cancel' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    fetch(`/api/turf-wars/${params.id}`)
      .then(r => r.json())
      .then(d => { setClaim(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.id])

  async function submit() {
    if (!claim || !action) return
    setSubmitting(true)
    setError(null)

    try {
      if (action === 'approve') {
        const res = await fetch(`/api/turf-wars/${params.id}/approve`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuccess('War declaration approved. Both orgs have been notified.')
        setClaim(prev => prev ? { ...prev, status: 'pending' } : prev)
        setAction(null)
      }

      if (action === 'cancel') {
        if (!cancelReason.trim()) { setError('A reason is required.'); setSubmitting(false); return }
        const res = await fetch(`/api/turf-wars/${params.id}/approve`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', cancel_reason: cancelReason.trim() }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuccess('Turf claim cancelled. Both orgs have been notified.')
        setClaim(prev => prev ? { ...prev, status: 'cancelled' } : prev)
        setAction(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 48, color: 'var(--bw-muted)', fontSize: 13 }}>Loading…</div>
  if (!claim)  return <div style={{ padding: 48, color: 'var(--bw-muted)', fontSize: 13 }}>Turf claim not found.</div>

  const isPending   = claim.status === 'operator_pending'
  const isLive      = claim.status === 'live'
  const isCompleted = ['successful', 'failed', 'contested'].includes(claim.status)
  const isCancelled = claim.status === 'cancelled'

  const CLAIM_TYPE_LABELS: Record<string, string> = {
    initial_claim: 'Initial Claim', sneak_attack: 'Sneak Attack', war_declaration: 'War Declaration',
  }

  return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 24, cursor: 'pointer' }} onClick={() => router.back()}>
        ← Turf Wars
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>
        {/* LEFT: Claim detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em', lineHeight: 1 }}>
                {CLAIM_TYPE_LABELS[claim.claim_type] ?? claim.claim_type}
              </h1>
              <StatusBadge status={claim.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              {new Date(claim.window_open_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
              {new Date(claim.window_open_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
              {new Date(claim.window_close_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>

          {/* Combatants */}
          <InfoCard label="Combatants">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#E24B4A', marginBottom: 4 }}>Attacker</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)' }}>{claim.attacking_org?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{claim.attacking_org?.org_type === 'fraternity' ? 'Fraternity' : 'Sorority'}</div>
              </div>
              <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#378ADD', marginBottom: 4 }}>Defender</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)' }}>
                  {claim.defending_org?.name ?? 'Neutral territory'}
                </div>
                {claim.defending_org && (
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{claim.defending_org.org_type === 'fraternity' ? 'Fraternity' : 'Sorority'}</div>
                )}
              </div>
            </div>
          </InfoCard>

          {/* Target bar */}
          <InfoCard label="Target bar">
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--bw-text)' }}>{claim.bar?.name}</div>
          </InfoCard>

          {/* Headcount tracking */}
          <InfoCard label="Headcount tracking">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <StatBlock label="Required" value={claim.required_headcount} color="var(--bw-gold)" />
              <StatBlock label="Attacker" value={claim.attacker_verified_headcount} color="#E24B4A" />
              <StatBlock label="Defender" value={claim.defender_verified_headcount} color="#378ADD" />
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--bw-surface)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (claim.attacker_verified_headcount / claim.required_headcount) * 100)}%`,
                background: '#E24B4A',
                borderRadius: 3,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
              {Math.round((claim.attacker_verified_headcount / claim.required_headcount) * 100)}% of required headcount
              {claim.claim_type === 'sneak_attack' && (
                <> · Detection at {claim.detection_threshold}%{claim.detected_at ? ' (detected)' : ' (not yet detected)'}</>
              )}
            </div>
          </InfoCard>

          {/* Settings */}
          <InfoCard label="Claim settings">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={`Rally window: ${claim.rally_window_minutes} min`} />
              <Chip label={`Lockout: ${claim.lockout_days} days`} />
              {claim.claim_type === 'sneak_attack' && <Chip label={`Detection: ${claim.detection_threshold}%`} />}
            </div>
          </InfoCard>

          {/* Result */}
          {isCompleted && claim.result && (
            <InfoCard label="Result">
              <div style={{ fontSize: 14, color: 'var(--bw-text)' }}>{claim.result}</div>
            </InfoCard>
          )}

          {/* Cancel reason */}
          {isCancelled && claim.cancel_reason && (
            <InfoCard label="Cancellation reason">
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>{claim.cancel_reason}</div>
            </InfoCard>
          )}
        </div>

        {/* RIGHT: Action panel */}
        <div style={{ position: 'sticky', top: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {success && (
            <div style={{ background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--bw-green)' }}>
              {success}
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(224,49,49,0.1)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--bw-red)' }}>
              {error}
            </div>
          )}

          {isPending && !action && !success && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 4 }}>
                Awaiting your decision
              </div>
              <ActionBtn label="Approve war declaration" color="var(--bw-green)" onClick={() => setAction('approve')} />
              <ActionBtn label="Cancel claim" color="var(--bw-red)" ghost onClick={() => setAction('cancel')} />
            </div>
          )}

          {action === 'approve' && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-green)' }}>Confirm approval</div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
                The war will be announced publicly. Both orgs will be notified to rally their members.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAction(null)} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px' }}>Back</button>
                <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--bw-green)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {submitting ? 'Saving…' : 'Approve'}
                </button>
              </div>
            </div>
          )}

          {action === 'cancel' && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-red)' }}>Cancel turf claim</div>
              <div>
                <label>Reason (shown to both orgs)</label>
                <textarea
                  className="input"
                  style={{ marginTop: 4, minHeight: 80, resize: 'vertical' }}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Violation of platform rules — sneak attacks not permitted on this bar."
                />
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--bw-red)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAction(null)} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px' }}>Back</button>
                <button onClick={submit} className="btn btn-danger" disabled={submitting} style={{ flex: 1, fontSize: 13, padding: '10px' }}>
                  {submitting ? 'Cancelling…' : 'Cancel claim'}
                </button>
              </div>
            </div>
          )}

          {isLive && (
            <div style={{ background: 'rgba(224,49,49,0.06)', border: '1px solid rgba(224,49,49,0.25)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#E24B4A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Battle in progress
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                Headcounts update live as members check in. No actions available during an active claim.
              </div>
            </div>
          )}

          {isCompleted && (
            <div style={{ background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.25)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--bw-green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Claim resolved
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                {claim.result ?? 'This turf claim has been resolved.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const COLORS: Record<string, string> = {
    operator_pending: 'var(--bw-gold)', live: '#E24B4A', successful: 'var(--bw-green)',
    failed: 'var(--bw-red)', contested: 'var(--bw-gold)', cancelled: 'var(--bw-muted)',
    pending: '#378ADD',
  }
  const LABELS: Record<string, string> = {
    pending: 'Pending', operator_pending: 'Needs approval', live: 'Live',
    successful: 'Successful', failed: 'Failed', contested: 'Contested', cancelled: 'Cancelled',
  }
  const color = COLORS[status] ?? 'var(--bw-muted)'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color, padding: '3px 10px', borderRadius: 20, background: `${color}18` }}>
      {LABELS[status] ?? status}
    </span>
  )
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color, letterSpacing: '0.04em', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{ background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--bw-muted)' }}>
      {label}
    </span>
  )
}

function ActionBtn({ label, color, ghost, onClick }: { label: string; color: string; ghost?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '11px 16px', borderRadius: 8,
        background: ghost ? 'transparent' : `${color}18`,
        border: `1px solid ${color}55`,
        color, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  )
}
