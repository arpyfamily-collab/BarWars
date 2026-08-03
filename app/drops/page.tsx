'use client'
/**
 * /drops
 *
 * The mystery drop page. Four states rendered in sequence:
 *   1. SCHEDULED   — teaser + countdown to queue open + guess game
 *   2. QUEUE_OPEN  — "You're in the queue" + countdown to drop
 *   3. LIVE        — eligible: claim your pass | not eligible: try next time
 *   4. SOLD_OUT / COMPLETED — result
 */

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PASS_TYPE_LABELS } from '@/types'
import type { PassType } from '@/types'

type DropStatus = 'scheduled' | 'queue_open' | 'live' | 'sold_out' | 'completed' | 'cancelled'

interface Drop {
  id:                   string
  status:               DropStatus
  queue_opens_at:       string
  drop_at:              string
  expires_at:           string
  total_passes:         number
  passes_claimed:       number
  discount_percent:     number
  original_price_cents: number
  teaser_text:          string | null
  is_surprise:          boolean
  pass_distribution:    Record<string, number> | null
  guess_reward_cents:   number
  venues:               { name: string }
}

interface MyEntry {
  queue_position: number | null
  eligible:       boolean
  pass_type:      string | null
  claimed:        boolean
  pass_id:        string | null
}

interface MyGuess {
  guessed_distribution: Record<string, number>
  was_correct:          boolean | null
  credit_awarded_cents: number
}

const PASS_TYPES: PassType[] = ['full_venue', 'music_hall', 'bull_patio', 'sports_lounge']

export default function DropsPage() {
  const [drop,       setDrop]       = useState<Drop | null>(null)
  const [myEntry,    setMyEntry]    = useState<MyEntry | null>(null)
  const [myGuess,    setMyGuess]    = useState<MyGuess | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [secsLeft,   setSecsLeft]   = useState(0)
  const [joining,    setJoining]    = useState(false)
  const [claiming,   setClaiming]   = useState(false)
  const [claimResult, setClaimResult] = useState<{ pass_type: string; qr_token: string } | null>(null)
  const [guess,      setGuess]      = useState<Record<string, number>>({ full_venue: 3, music_hall: 3, bull_patio: 2, sports_lounge: 2 })
  const [guessSubmitted, setGuessSubmitted] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadDrop = async () => {
    const res  = await fetch('/api/drops')
    const data = await res.json()
    setDrop(data.drop)
    setMyEntry(data.my_entry)
    setMyGuess(data.my_guess)
    if (data.my_guess) setGuessSubmitted(true)
    setLoading(false)
  }

  useEffect(() => {
    loadDrop()

    // Real-time: watch for status changes
    const supabase = createClient()
    const channel  = supabase.channel('drops-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mystery_drops' }, () => {
        loadDrop()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!drop) return
    const target = drop.status === 'scheduled' ? drop.queue_opens_at
                 : drop.status === 'queue_open' ? drop.drop_at
                 : drop.expires_at

    const calc = () => setSecsLeft(Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)))
    calc()
    timerRef.current = setInterval(calc, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [drop?.status, drop?.queue_opens_at, drop?.drop_at, drop?.expires_at])

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  const joinQueue = async () => {
    if (!drop) return
    setJoining(true)
    setError(null)
    const res  = await fetch(`/api/drops/${drop.id}/enter-queue`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setJoining(false); return }
    setMyEntry(data.entry)
    setJoining(false)
  }

  const claim = async () => {
    if (!drop) return
    setClaiming(true)
    setError(null)
    const res  = await fetch(`/api/drops/${drop.id}/claim`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setClaiming(false); return }
    setClaimResult({ pass_type: data.pass_type, qr_token: data.qr_token })
    setMyEntry(prev => prev ? { ...prev, claimed: true } : prev)
    setClaiming(false)
  }

  const submitGuess = async () => {
    if (!drop) return
    const total = Object.values(guess).reduce((a, b) => a + b, 0)
    if (total !== drop.total_passes) { setError(`Guess must total ${drop.total_passes} passes`); return }
    await fetch(`/api/drops/${drop.id}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distribution: guess }),
    })
    setGuessSubmitted(true)
    setError(null)
  }

  const adjustGuess = (type: string, delta: number) => {
    setGuess(prev => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 0) + delta) }))
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
      Loading tonight's drop…
    </div>
  )

  if (!drop) return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Mystery Drop</div>
      </div>
      <div className="page-content">
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--bw-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎲</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No drop scheduled</div>
          <div style={{ fontSize: 13 }}>Check back later. When a drop is coming, you'll hear about it.</div>
        </div>
      </div>
      <BottomNav />
    </div>
  )

  const discountedPrice = Math.round(drop.original_price_cents * (1 - drop.discount_percent / 100))
  const guessTotal      = Object.values(guess).reduce((a, b) => a + b, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
              Mystery Drop
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 2 }}>
              {drop.venues.name}
            </div>
          </div>
          <div style={{
            background:    'rgba(245,184,0,0.12)',
            border:        '1px solid rgba(245,184,0,0.3)',
            borderRadius:  8,
            padding:       '6px 12px',
            textAlign:     'center',
          }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 11, letterSpacing: '0.1em', color: 'var(--bw-gold)', textTransform: 'uppercase' }}>
              {drop.discount_percent}% off
            </div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, color: 'var(--bw-gold)', letterSpacing: '0.04em', lineHeight: 1 }}>
              ${(discountedPrice / 100).toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      <div className="page-content">

        {/* ── CLAIMED — show the pass ────────────────────────────────── */}
        {claimResult && (
          <div className="card" style={{ textAlign: 'center', borderColor: 'rgba(46,204,113,0.4)', background: 'rgba(46,204,113,0.06)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎟️</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--bw-green)', letterSpacing: '0.04em', marginBottom: 4 }}>
              You got one!
            </div>
            <div style={{ fontSize: 14, color: 'var(--bw-text)', marginBottom: 4 }}>
              {PASS_TYPE_LABELS[claimResult.pass_type as PassType]} pass
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 16 }}>
              Find your QR code in My Passes
            </div>
            <a href="/my-passes" className="btn btn-primary" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
              View my pass
            </a>
          </div>
        )}

        {/* ── LIVE — eligible to claim ───────────────────────────────── */}
        {!claimResult && drop.status === 'live' && myEntry?.eligible && !myEntry.claimed && (
          <div className="card" style={{ borderColor: 'rgba(245,184,0,0.5)', background: 'rgba(245,184,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>⚡</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: 'var(--bw-gold)', letterSpacing: '0.04em', lineHeight: 1, marginBottom: 4 }}>
                You're in!
              </div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 4 }}>
                Queue position #{myEntry.queue_position}
              </div>
              {myEntry.pass_type && (
                <div style={{ fontSize: 14, color: 'var(--bw-text)', fontWeight: 600 }}>
                  You got: {PASS_TYPE_LABELS[myEntry.pass_type as PassType]}
                </div>
              )}
            </div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.1em', color: 'var(--bw-red)', textAlign: 'center', marginBottom: 14 }}>
              {fmtTime(secsLeft)} to claim
            </div>
            {error && <div style={{ fontSize: 12, color: 'var(--bw-red)', marginBottom: 10, textAlign: 'center' }}>{error}</div>}
            <button className="btn btn-primary" onClick={claim} disabled={claiming} style={{ fontSize: 16, padding: '15px' }}>
              {claiming ? 'Claiming…' : `Claim ${PASS_TYPE_LABELS[myEntry.pass_type as PassType] ?? 'pass'} — $${(discountedPrice / 100).toFixed(0)}`}
            </button>
          </div>
        )}

        {/* ── LIVE — not eligible ────────────────────────────────────── */}
        {drop.status === 'live' && myEntry && !myEntry.eligible && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>😔</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>You didn't make the cut this time</div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              Queue position #{myEntry.queue_position} — only {drop.total_passes} passes available. Tomorrow's drop starts fresh.
            </div>
          </div>
        )}

        {/* ── LIVE — not in queue ────────────────────────────────────── */}
        {drop.status === 'live' && !myEntry && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⏰</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop is live — queue closed</div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              The waiting room closed at drop time. Catch the next one — Library Card holders get in 5 minutes early.
            </div>
          </div>
        )}

        {/* ── QUEUE OPEN ────────────────────────────────────────────── */}
        {drop.status === 'queue_open' && (
          <>
            {/* Countdown to drop */}
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8 }}>
                Drop in
              </div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 64, letterSpacing: '0.02em', color: 'var(--bw-gold)', lineHeight: 1, marginBottom: 8 }}>
                {fmtTime(secsLeft)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                {drop.total_passes} passes · {drop.discount_percent}% off · queue randomizes at drop time
              </div>
            </div>

            {/* Queue status */}
            {myEntry ? (
              <div className="card" style={{ textAlign: 'center', borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.06)' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                <div style={{ fontWeight: 600, color: 'var(--bw-green)', marginBottom: 4 }}>You're in the queue</div>
                <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                  Positions randomize at drop time — fastest finger doesn't win. Stay on this page.
                </div>
              </div>
            ) : (
              <div>
                {error && <div style={{ fontSize: 13, color: 'var(--bw-red)', marginBottom: 10, textAlign: 'center' }}>{error}</div>}
                <button className="btn btn-primary" onClick={joinQueue} disabled={joining} style={{ fontSize: 16, padding: '16px' }}>
                  {joining ? 'Joining…' : 'Join the queue'}
                </button>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)', textAlign: 'center', marginTop: 8 }}>
                  Library Card holders got in 5 min early
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SCHEDULED — teaser + guess game ─────────────────────── */}
        {drop.status === 'scheduled' && (
          <>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎲</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 6 }}>
                {drop.teaser_text ?? (drop.is_surprise ? 'Something drops tonight…' : 'Drop tonight')}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>
                Queue opens in
              </div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, letterSpacing: '0.02em', color: 'var(--bw-gold)', lineHeight: 1 }}>
                {fmtTime(secsLeft)}
              </div>
            </div>

            {/* Guess game */}
            {!guessSubmitted ? (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 4 }}>
                  Daily guess
                </div>
                <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 4 }}>
                  How will the {drop.total_passes} passes be split tonight?
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginBottom: 16 }}>
                  Guess correctly → earn ${(drop.guess_reward_cents / 100).toFixed(2)} credit
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {PASS_TYPES.map(type => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--bw-text)' }}>{PASS_TYPE_LABELS[type]}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => adjustGuess(type, -1)} style={{ background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: 'var(--bw-text)', fontSize: 16 }}>−</button>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--bw-gold)', width: 20, textAlign: 'center' }}>{guess[type] ?? 0}</span>
                        <button onClick={() => adjustGuess(type, 1)}  style={{ background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: 'var(--bw-text)', fontSize: 16 }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Total: {guessTotal} / {drop.total_passes}</span>
                  {guessTotal !== drop.total_passes && (
                    <span style={{ fontSize: 12, color: 'var(--bw-red)' }}>Must equal {drop.total_passes}</span>
                  )}
                </div>
                {error && <div style={{ fontSize: 12, color: 'var(--bw-red)', marginBottom: 10 }}>{error}</div>}
                <button
                  className="btn btn-ghost"
                  onClick={submitGuess}
                  disabled={guessTotal !== drop.total_passes}
                  style={{ fontSize: 13 }}
                >
                  Submit guess
                </button>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>🎯</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Guess submitted</div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                  You'll find out after the drop resolves.
                </div>
                {myGuess?.was_correct === true && (
                  <div style={{ marginTop: 10, color: 'var(--bw-green)', fontWeight: 600 }}>
                    ✅ Correct! ${(myGuess.credit_awarded_cents / 100).toFixed(2)} credit added.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── SOLD OUT / COMPLETED ────────────────────────────────── */}
        {['sold_out', 'completed'].includes(drop.status) && !claimResult && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>
              {drop.status === 'sold_out' ? '🔥' : '✓'}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {drop.status === 'sold_out' ? 'All passes claimed!' : "Drop's over"}
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              {drop.passes_claimed} of {drop.total_passes} passes went. Next drop tomorrow.
            </div>
            {myEntry?.claimed && (
              <a href="/my-passes" style={{ display: 'block', marginTop: 16 }}>
                <button className="btn btn-primary" style={{ fontSize: 13 }}>View my pass</button>
              </a>
            )}
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
