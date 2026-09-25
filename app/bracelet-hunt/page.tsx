'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/BottomNav'
import { Lock, Unlock, ScanLine, Gift, Award, X, Camera } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import jsQR from 'jsqr'

interface BraceletDrop {
  id: string
  venue_id: string
  qr_token: string
  status: string
  offer_type: string
  offer_value: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_1_released_at: string | null
  clue_2_released_at: string | null
  clue_3_released_at: string | null
  hidden_at: string
  found_by: string | null
  found_at: string | null
  venues: { name: string } | null
}

interface FoundItem {
  id: string
  status: string
  offer_value: string | null
  found_at: string | null
  found_by: string | null
  venues: { name: string } | null
}

interface ScanResult {
  bracelet: {
    id: string
    venue_id: string
    offer_type: string
    offer_value: string
    bar_name: string | null
  }
}

interface ActionResult {
  success: boolean
  bracelet: { id: string; status: string; offer_value: string; bar_name: string | null }
  action: string
  armory_id: string | null
  valor_bonds: number
  badge: string | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Releasing...'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function BraceletHuntPage() {
  const [activeHunts, setActiveHunts] = useState<BraceletDrop[]>([])
  const [recentlyFound, setRecentlyFound] = useState<FoundItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showScanInput, setShowScanInput] = useState<string | null>(null)
  const [qrToken, setQrToken] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, setTick] = useState(0)

  const loadData = useCallback(async () => {
    const supabase = createClient()

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data: active } = await supabase
      .from('bracelet_drops')
      .select(`
        id, venue_id, qr_token, status, offer_type, offer_value,
        clue_1, clue_2, clue_3,
        clue_1_released_at, clue_2_released_at, clue_3_released_at,
        hidden_at, found_by, found_at,
        venues:venue_id(name)
      `)
      .eq('status', 'hidden')
      .gte('hidden_at', fortyEightHoursAgo)
      .order('hidden_at', { ascending: false })

    setActiveHunts((active as unknown as BraceletDrop[]) ?? [])

    const { data: found } = await supabase
      .from('bracelet_drops')
      .select(`
        id, status, offer_value, found_at, found_by,
        venues:venue_id(name)
      `)
      .in('status', ['kept', 'donated'])
      .not('found_at', 'is', null)
      .order('found_at', { ascending: false })
      .limit(5)

    setRecentlyFound((found as unknown as FoundItem[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()

    const supabase = createClient()
    const channel = supabase.channel('bracelet-hunt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bracelet_drops' }, () => {
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  // Re-render every second for countdown timers
  useEffect(() => {
    if (activeHunts.length === 0) return
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [activeHunts.length])

  const handleNativeScan = async () => {
    setScanning(true)
    setError(null)
    try {
      const photo = await CapacitorCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        quality: 90,
      })

      const img = new Image()
      img.src = photo.dataUrl!
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Image load failed'))
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code) {
        setQrToken(code.data)
        setShowScanInput('native-result')
      } else {
        setError('No QR code detected. Try again or enter the code manually.')
        setShowScanInput(null)
      }
    } catch {
      setError('Camera error. Try again or enter the code manually.')
    } finally {
      setScanning(false)
    }
  }

  const handleScanSubmit = async () => {
    if (!qrToken.trim()) return
    setScanning(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be signed in to scan bracelets.')
        setScanning(false)
        return
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/bracelet-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ qr_token: qrToken.trim(), user_id: user.id, action: null }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid bracelet code')
      } else {
        setScanResult(data)
        setShowScanInput(null)
        setQrToken('')
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setScanning(false)
    }
  }

  const handleAction = async (action: 'keep' | 'donate') => {
    if (!scanResult) return
    setActing(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const res = await fetch(`${SUPABASE_URL}/functions/v1/bracelet-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          qr_token: qrToken.trim() || scanResult.bracelet.id,
          user_id: user.id,
          action,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to process')
      } else {
        setActionResult(data)
        setScanResult(null)
        setQrToken('')
        loadData()
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setActing(false)
    }
  }

  const renderClue = (
    clueNum: number,
    clueText: string | null,
    releasedAt: string | null,
    accentColor: string
  ) => {
    const isReleased = releasedAt ? new Date(releasedAt).getTime() <= Date.now() : false
    const hasText = clueText && isReleased

    return (
      <div
        key={clueNum}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          background: hasText ? 'var(--bw-yellow-glow)' : 'transparent',
          border: `1px solid ${hasText ? 'rgba(224,255,0,0.2)' : 'var(--bw-border)'}`,
          marginBottom: 6,
          transition: 'all 0.2s',
        }}
      >
        <div style={{ flexShrink: 0, marginTop: 1, color: hasText ? accentColor : 'var(--bw-muted)' }}>
          {hasText ? <Unlock size={14} /> : <Lock size={14} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: hasText ? accentColor : 'var(--bw-muted)', marginBottom: 2 }}>
            Clue {clueNum}
          </div>
          {hasText ? (
            <div style={{ fontSize: 13, color: 'var(--bw-text)' }}>{clueText}</div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
              {releasedAt ? `Unlocks in ${fmtCountdown(releasedAt)}` : 'Not yet released'}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading the hunt&#8230;
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          BRACELET HUNT
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Find the bracelet. Scan the code. Claim your reward.
        </div>
      </div>

      <div className="page-content">

        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)' }}>{error}</div>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', fontSize: 11, marginTop: 6, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Active Hunts ─────────────────────────────────────────── */}
        {activeHunts.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--bw-yellow)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  boxShadow: '0 0 8px var(--bw-yellow)',
                }}
              />
              <span style={{ fontSize: 36 }}>&#128269;</span>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--bw-text)' }}>
              No bracelets hidden right now
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
              Bars drop them throughout the week &#8212; check back often.
            </div>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
          </div>
        )}

        {activeHunts.map((hunt) => (
          <div key={hunt.id} className="card" style={{ borderLeft: '3px solid var(--bw-yellow)' }}>
            {/* Bar name badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'var(--bw-yellow-glow)',
                  color: 'var(--bw-yellow)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  letterSpacing: '0.06em',
                }}
              >
                {hunt.venues?.name ?? 'Unknown bar'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--bw-muted)' }}>
                {timeAgo(hunt.hidden_at)}
              </div>
            </div>

            {/* Offer */}
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--bw-text)', marginBottom: 14 }}>
              {hunt.offer_value ?? 'Reward at this bar'}
            </div>

            {/* Clues */}
            <div style={{ marginBottom: 14 }}>
              {renderClue(1, hunt.clue_1, hunt.clue_1_released_at, 'var(--bw-yellow)')}
              {renderClue(2, hunt.clue_2, hunt.clue_2_released_at, 'var(--bw-yellow)')}
              {renderClue(3, hunt.clue_3, hunt.clue_3_released_at, 'var(--bw-yellow)')}
            </div>

            {/* Scan button / input */}
            {showScanInput === hunt.id || showScanInput === 'native-result' ? (
              <div>
                {qrToken && (
                  <div style={{ fontSize: 11, color: 'var(--bw-green)', marginBottom: 6 }}>
                    QR detected: {qrToken.slice(0, 20)}...
                  </div>
                )}
                <input
                  className="input"
                  type="text"
                  placeholder="Paste bracelet code here"
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  style={{ marginBottom: 8, fontSize: 13 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleScanSubmit}
                    disabled={scanning || !qrToken.trim()}
                    style={{
                      flex: 1,
                      background: 'var(--bw-yellow)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#0A0A0C',
                      cursor: scanning ? 'not-allowed' : 'pointer',
                      opacity: scanning || !qrToken.trim() ? 0.5 : 1,
                    }}
                  >
                    {scanning ? 'Scanning...' : 'Submit'}
                  </button>
                  {Capacitor.isNativePlatform() && (
                    <button
                      onClick={handleNativeScan}
                      disabled={scanning}
                      style={{
                        background: 'var(--bw-surface)',
                        border: '1px solid var(--bw-border)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--bw-yellow)',
                        cursor: scanning ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Camera size={16} /> Scan
                    </button>
                  )}
                  <button
                    onClick={() => { setShowScanInput(null); setQrToken('') }}
                    style={{
                      background: 'var(--bw-surface)',
                      border: '1px solid var(--bw-border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: 'var(--bw-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (Capacitor.isNativePlatform()) {
                    handleNativeScan()
                  } else {
                    setShowScanInput(hunt.id)
                    setQrToken('')
                  }
                }}
                style={{
                  width: '100%',
                  background: 'var(--bw-yellow)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#0A0A0C',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'opacity 0.15s',
                  opacity: scanning ? 0.5 : 1,
                }}
              >
                <ScanLine size={18} />
                {scanning ? 'Opening camera...' : 'Scan QR'}
              </button>
            )}
          </div>
        ))}

        {/* ── Recently Found ───────────────────────────────────────── */}
        {recentlyFound.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
              Recently found
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentlyFound.map((item) => (
                <div key={item.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flexShrink: 0 }}>
                    {item.status === 'donated' ? (
                      <Award size={16} style={{ color: 'var(--bw-violet-soft)' }} />
                    ) : (
                      <Gift size={16} style={{ color: 'var(--bw-yellow)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bw-text)' }}>
                      {item.venues?.name ?? 'Unknown bar'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                      A soldier found this &middot; {item.found_at ? timeAgo(item.found_at) : 'recently'}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {item.status === 'donated' ? (
                      <span className="badge badge-violet">Donated</span>
                    ) : (
                      <span className="badge badge-yellow">Kept</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Link to Mystery Drops ────────────────────────────────── */}
        <Link
          href="/drops"
          className="btn btn-ghost"
          style={{ fontSize: 12, textDecoration: 'none', padding: '10px' }}
        >
          View Mystery Drops
        </Link>

      </div>
      <BottomNav />

      {/* ── Scan Result Modal ─────────────────────────────────────── */}
      {scanResult && (
        <div
          onClick={() => setScanResult(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              maxWidth: 380,
              width: '100%',
              textAlign: 'center',
              borderColor: 'rgba(224,255,0,0.4)',
              background: 'var(--bw-card)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setScanResult(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'none',
                border: 'none',
                color: 'var(--bw-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <div style={{ fontSize: 40, marginBottom: 8 }}>&#127881;</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-yellow)', letterSpacing: '0.04em', marginBottom: 4 }}>
              You found it!
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 4 }}>
              {scanResult.bracelet.offer_value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 20 }}>
              at {scanResult.bracelet.bar_name ?? 'the bar'}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => handleAction('keep')}
                disabled={acting}
                style={{
                  flex: 1,
                  background: 'var(--bw-yellow)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#0A0A0C',
                  cursor: acting ? 'not-allowed' : 'pointer',
                  opacity: acting ? 0.5 : 1,
                }}
              >
                Keep it
              </button>
              <button
                onClick={() => handleAction('donate')}
                disabled={acting}
                style={{
                  flex: 1,
                  background: 'var(--bw-violet)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#fff',
                  cursor: acting ? 'not-allowed' : 'pointer',
                  opacity: acting ? 0.5 : 1,
                }}
              >
                Donate to Armory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Result Modal ───────────────────────────────────── */}
      {actionResult && (
        <div
          onClick={() => setActionResult(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              maxWidth: 380,
              width: '100%',
              textAlign: 'center',
              borderColor: actionResult.action === 'donate' ? 'rgba(123,44,191,0.4)' : 'rgba(224,255,0,0.4)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setActionResult(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'none',
                border: 'none',
                color: 'var(--bw-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <div style={{ fontSize: 40, marginBottom: 8 }}>
              {actionResult.action === 'donate' ? '&#127942;' : '&#127873;'}
            </div>

            {actionResult.action === 'donate' ? (
              <>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-violet-soft)', letterSpacing: '0.04em', marginBottom: 8 }}>
                  Donated to the Armory!
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--bw-yellow)', marginBottom: 4 }}>
                  +{actionResult.valor_bonds} Valor Bonds
                </div>
                {actionResult.badge && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bw-violet-glow)', color: 'var(--bw-violet-soft)', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', marginTop: 8 }}>
                    <Award size={14} />
                    {actionResult.badge} badge earned
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-yellow)', letterSpacing: '0.04em', marginBottom: 8 }}>
                  It&apos;s yours!
                </div>
                <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 4 }}>
                  {actionResult.bracelet.offer_value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                  Show this at {actionResult.bracelet.bar_name ?? 'the bar'} to redeem.
                </div>
              </>
            )}

            <button
              onClick={() => setActionResult(null)}
              className="btn btn-ghost"
              style={{ marginTop: 20, fontSize: 13 }}
            >
              Back to the hunt
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
