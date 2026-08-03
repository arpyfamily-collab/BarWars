'use client'
/**
 * /operator/challenges/[id]
 *
 * The core operator action screen. Three panels:
 *   LEFT  — challenge detail (trash talk, stakes, bars, window, scoring)
 *   RIGHT — action panel (approve / modify / cancel)
 *
 * For live challenges: shows live score, score breakdown, and momentum log.
 * For completed:       shows result, forfeit status, and mark-forfeit-paid button.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type ChallengeStatus =
  | 'proposed' | 'opponent_pending' | 'operator_pending'
  | 'approved' | 'live' | 'completed' | 'cancelled' | 'forfeit_unpaid'

interface ChallengeDetail {
  id:                 string
  status:             ChallengeStatus
  trash_talk:         string
  stakes_description: string
  scoring_metric:     string
  score_weights:      Record<string, number>
  window_start:       string
  window_end:         string
  challenger_score:   number
  opponent_score:     number
  winner_bar_id?:     string
  forfeit_paid:       boolean
  forfeit_deadline?:  string
  cancel_reason?:     string
  challenger:         { id: string; name: string; wins: number; losses: number }
  opponent:           { id: string; name: string; wins: number; losses: number }
  winner?:            { id: string; name: string }
  recent_score_events: Array<{ event_type: string; points: number; bar_id: string; occurred_at: string }>
  participant_counts:  Record<string, number>
}

export default function ChallengeReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [action,    setAction]    = useState<'approve' | 'modify' | 'cancel' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  // Modify form state
  const [modTrashTalk,   setModTrashTalk]   = useState('')
  const [modStakes,      setModStakes]      = useState('')
  const [cancelReason,   setCancelReason]   = useState('')

  useEffect(() => {
    fetch(`/api/challenges/${params.id}`)
      .then(r => r.json())
      .then(d => { setChallenge(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.id])

  async function submit() {
    if (!challenge || !action) return
    setSubmitting(true)
    setError(null)

    try {
      if (action === 'approve' || action === 'modify') {
        const mods: Record<string, string> = {}
        if (action === 'modify') {
          if (modTrashTalk.trim())  mods.trash_talk         = modTrashTalk.trim()
          if (modStakes.trim())     mods.stakes_description = modStakes.trim()
          if (Object.keys(mods).length === 0) {
            setError('Enter at least one modification, or choose Approve directly.')
            setSubmitting(false)
            return
          }
        }

        const res = await fetch(`/api/challenges/${params.id}/approve`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'approve', ...(action === 'modify' ? { modifications: mods } : {}) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuccess(action === 'modify' ? 'Challenge modified and approved.' : 'Challenge approved. War will be declared at battle start.')
        setChallenge(prev => prev ? { ...prev, status: 'approved' } : prev)
        setAction(null)
      }

      if (action === 'cancel') {
        if (!cancelReason.trim()) { setError('A reason is required.'); setSubmitting(false); return }
        const res = await fetch(`/api/challenges/${params.id}/approve`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'cancel', cancel_reason: cancelReason.trim() }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuccess('Challenge cancelled. Both bars have been notified.')
        setChallenge(prev => prev ? { ...prev, status: 'cancelled' } : prev)
        setAction(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function markForfeitPaid() {
    if (!challenge) return
    setSubmitting(true)
    const res = await fetch(`/api/challenges/${params.id}/forfeit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: true }),
    })
    if (res.ok) {
      setChallenge(prev => prev ? { ...prev, forfeit_paid: true, status: 'completed' } : prev)
      setSuccess('Forfeit marked as paid.')
    }
    setSubmitting(false)
  }

  if (loading) return <div style={{ padding: 48, color: 'var(--bw-muted)', fontSize: 13 }}>Loading…</div>
  if (!challenge) return <div style={{ padding: 48, color: 'var(--bw-muted)', fontSize: 13 }}>Challenge not found.</div>

  const isPending   = challenge.status === 'operator_pending'
  const isLive      = challenge.status === 'live'
  const isCompleted = ['completed', 'forfeit_unpaid'].includes(challenge.status)
  const isCancelled = challenge.status === 'cancelled'

  const totalParticipants = Object.values(challenge.participant_counts ?? {}).reduce((a, b) => a + b, 0)

  const EVENT_LABELS: Record<string, string> = {
    checkin: 'Check-in', pass_purchase: 'Pass', room_upgrade: 'Upgrade', referral_checkin: 'Referral'
  }

  return (
    <div style={{ padding: '40px 48px' }}>
      {/* Back + breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 24, cursor: 'pointer' }} onClick={() => router.back()}>
        ← Challenges
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>

        {/* ── LEFT: Challenge detail ────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Title + status */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em', lineHeight: 1 }}>
                {challenge.challenger.name} vs {challenge.opponent.name}
              </h1>
              <StatusBadge status={challenge.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              {new Date(challenge.window_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
              {new Date(challenge.window_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
              {new Date(challenge.window_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>

          {/* Trash talk */}
          <InfoCard label="Trash talk (push notification copy)">
            <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--bw-text)', lineHeight: 1.5 }}>
              "{challenge.trash_talk}"
            </div>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 6 }}>
              {challenge.trash_talk.length}/120 characters
            </div>
          </InfoCard>

          {/* Stakes */}
          <InfoCard label="Stakes">
            <div style={{ fontSize: 14, color: 'var(--bw-text)' }}>{challenge.stakes_description}</div>
          </InfoCard>

          {/* Bars */}
          <InfoCard label="Combatants">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { bar: challenge.challenger, color: '#E24B4A', role: 'Challenger' },
                { bar: challenge.opponent,   color: '#378ADD', role: 'Opponent'   },
              ].map(({ bar, color, role }) => (
                <div key={bar.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color, marginBottom: 4 }}>{role}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)', marginBottom: 4 }}>{bar.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{bar.wins}W – {bar.losses}L</div>
                </div>
              ))}
            </div>
          </InfoCard>

          {/* Scoring */}
          <InfoCard label="Scoring">
            <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 10 }}>
              Metric: <span style={{ fontWeight: 600 }}>{challenge.scoring_metric.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(challenge.score_weights ?? {}).map(([k, v]) => (
                <span key={k} style={{ background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--bw-muted)' }}>
                  {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--bw-text)' }}>{v} pts</strong>
                </span>
              ))}
            </div>
          </InfoCard>

          {/* Live scores (if live) */}
          {(isLive || isCompleted) && (
            <InfoCard label={isLive ? 'Live scores' : 'Final scores'}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <ScoreBlock name={challenge.challenger.name} score={challenge.challenger_score} color="#E24B4A" isWinner={challenge.winner_bar_id === challenge.challenger.id} />
                <ScoreBlock name={challenge.opponent.name}   score={challenge.opponent_score}   color="#378ADD" isWinner={challenge.winner_bar_id === challenge.opponent.id} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                {totalParticipants} total fighters
              </div>
            </InfoCard>
          )}

          {/* Score event log */}
          {(isLive || isCompleted) && (challenge.recent_score_events ?? []).length > 0 && (
            <InfoCard label="Recent activity">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {challenge.recent_score_events.slice(0, 8).map((e, i) => {
                  const isChallenger = e.bar_id === challenge.challenger.id
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--bw-muted)' }}>
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                      <span style={{ color: isChallenger ? '#E24B4A' : '#378ADD', fontWeight: 600 }}>
                        +{e.points} · {isChallenger ? challenge.challenger.name.split(' ')[0] : challenge.opponent.name.split(' ')[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </InfoCard>
          )}

          {/* Cancel reason */}
          {isCancelled && challenge.cancel_reason && (
            <InfoCard label="Cancellation reason">
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>{challenge.cancel_reason}</div>
            </InfoCard>
          )}
        </div>

        {/* ── RIGHT: Action panel ───────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Success / error banners */}
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

          {/* Pending approval actions */}
          {isPending && !action && !success && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 4 }}>
                Awaiting your decision
              </div>
              <ActionBtn label="✅ Approve" color="var(--bw-green)" onClick={() => setAction('approve')} />
              <ActionBtn label="✏️ Approve with edits" color="var(--bw-gold)" onClick={() => { setAction('modify'); setModTrashTalk(challenge.trash_talk); setModStakes(challenge.stakes_description) }} />
              <ActionBtn label="❌ Cancel challenge" color="var(--bw-red)" ghost onClick={() => setAction('cancel')} />
            </div>
          )}

          {/* Approve confirm */}
          {action === 'approve' && (
            <ActionForm
              title="Confirm approval"
              description="War will be declared to all users at battle start. Both bar admins will be notified now."
              confirmLabel="Approve challenge"
              confirmColor="var(--bw-green)"
              submitting={submitting}
              onConfirm={submit}
              onCancel={() => setAction(null)}
            />
          )}

          {/* Modify form */}
          {action === 'modify' && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid rgba(245,184,0,0.3)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-gold)' }}>
                ✏️ Approve with edits
              </div>
              <div>
                <label>Trash talk (leave blank to keep original)</label>
                <input
                  className="input"
                  style={{ marginTop: 4 }}
                  value={modTrashTalk}
                  onChange={e => setModTrashTalk(e.target.value)}
                  maxLength={120}
                  placeholder={challenge.trash_talk}
                />
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 3 }}>{modTrashTalk.length}/120</div>
              </div>
              <div>
                <label>Stakes (leave blank to keep original)</label>
                <textarea
                  className="input"
                  style={{ marginTop: 4, minHeight: 72, resize: 'vertical' }}
                  value={modStakes}
                  onChange={e => setModStakes(e.target.value)}
                  placeholder={challenge.stakes_description}
                />
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--bw-red)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAction(null)} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px' }}>Cancel</button>
                <button onClick={submit} className="btn btn-primary" disabled={submitting} style={{ flex: 1, fontSize: 13, padding: '10px', background: 'var(--bw-gold)', color: 'var(--bw-black)' }}>
                  {submitting ? 'Saving…' : 'Approve with edits'}
                </button>
              </div>
            </div>
          )}

          {/* Cancel form */}
          {action === 'cancel' && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-red)' }}>❌ Cancel challenge</div>
              <div>
                <label>Reason (shown to both bar admins)</label>
                <textarea
                  className="input"
                  style={{ marginTop: 4, minHeight: 80, resize: 'vertical' }}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Stakes violate platform policy — please resubmit with a revised forfeit."
                />
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--bw-red)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAction(null)} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px' }}>Back</button>
                <button onClick={submit} className="btn btn-danger" disabled={submitting} style={{ flex: 1, fontSize: 13, padding: '10px' }}>
                  {submitting ? 'Cancelling…' : 'Cancel challenge'}
                </button>
              </div>
            </div>
          )}

          {/* Forfeit unpaid — mark paid button */}
          {challenge.status === 'forfeit_unpaid' && !challenge.forfeit_paid && (
            <div style={{ background: 'var(--bw-card)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--bw-red)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Forfeit overdue
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                Losing bar has not confirmed the forfeit. Mark as paid once you've confirmed it offline.
              </div>
              <button className="btn btn-primary" onClick={markForfeitPaid} disabled={submitting} style={{ fontSize: 13 }}>
                {submitting ? 'Saving…' : 'Mark forfeit as paid'}
              </button>
            </div>
          )}

          {/* Completed / forfeit paid state */}
          {isCompleted && challenge.forfeit_paid && (
            <div style={{ background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.25)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--bw-green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                All settled
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                {challenge.winner?.name} won. Forfeit confirmed.
              </div>
            </div>
          )}

          {/* Live — read-only notice */}
          {isLive && (
            <div style={{ background: 'rgba(224,49,49,0.06)', border: '1px solid rgba(224,49,49,0.25)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#E24B4A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Battle in progress
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                Scores update live. No actions available during an active challenge.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const COLORS: Record<string, string> = {
    operator_pending: 'var(--bw-gold)', live: '#E24B4A', completed: 'var(--bw-green)',
    approved: '#378ADD', cancelled: 'var(--bw-muted)', forfeit_unpaid: 'var(--bw-red)',
  }
  const LABELS: Record<string, string> = {
    proposed: 'Proposed', opponent_pending: 'Awaiting rival', operator_pending: 'Needs approval',
    approved: 'Approved', live: 'Live', completed: 'Completed', cancelled: 'Cancelled', forfeit_unpaid: 'Forfeit unpaid',
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

function ScoreBlock({ name, score, color, isWinner }: { name: string; score: number; color: string; isWinner?: boolean }) {
  return (
    <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 4 }}>{name} {isWinner ? '🏆' : ''}</div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color, letterSpacing: '0.04em', lineHeight: 1 }}>{score}</div>
    </div>
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

function ActionForm({ title, description, confirmLabel, confirmColor, submitting, onConfirm, onCancel }: {
  title: string; description: string; confirmLabel: string; confirmColor: string;
  submitting: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ background: 'var(--bw-card)', border: `1px solid ${confirmColor}44`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--bw-muted)', lineHeight: 1.5 }}>{description}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px' }}>Back</button>
        <button onClick={onConfirm} disabled={submitting} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {submitting ? 'Saving…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
