'use client'
/**
 * /dashboard/scanner
 *
 * Production QR scanner using @zxing/browser.
 * Continuously decodes from the rear camera.
 * Falls back to manual token input if camera is unavailable.
 *
 * Install: npm install @zxing/browser @zxing/library
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ScanResult } from '@/types'

type ScanState = 'idle' | 'starting' | 'scanning' | 'success' | 'denied' | 'renewal' | 'error'

export default function ScannerPage() {
  const [state,       setState]      = useState<ScanState>('idle')
  const [result,      setResult]     = useState<ScanResult | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [camError,    setCamError]   = useState<string | null>(null)

  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<any>(null)
  const cooldownRef = useRef(false)  // prevents duplicate scans of the same code

  // ── Start camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setState('starting')
    try {
      const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      // Prefer rear camera
      const devices   = await BrowserMultiFormatReader.listVideoInputDevices()
      const rearCam   = devices.find(d => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1]
      const deviceId  = rearCam?.deviceId

      setState('scanning')

      await reader.decodeFromVideoDevice(
        deviceId ?? undefined,
        videoRef.current!,
        (result, error) => {
          if (result && !cooldownRef.current) {
            const text = result.getText()
            handleScan(text)
          }
          // NotFoundException fires on every frame with no code — ignore
          if (error && !(error instanceof NotFoundException)) {
            console.warn('[scanner]', error)
          }
        }
      )
    } catch (e: any) {
      console.error('[scanner] Camera error:', e)
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setCamError('Camera permission denied. Use manual entry below.')
      } else {
        setCamError('Camera unavailable. Use manual entry below.')
      }
      setState('idle')
    }
  }, [])

  // ── Stop camera on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      readerRef.current?.reset()
    }
  }, [])

  // ── QR payload → redeem ────────────────────────────────────────────────
  const handleScan = useCallback(async (raw: string) => {
    if (cooldownRef.current) return
    cooldownRef.current = true

    // Parse the JSON payload: { t: '<uuid>', v: 1 }
    let token: string | null = null
    try {
      const parsed = JSON.parse(raw)
      token = parsed?.t ?? null
    } catch {
      // Fallback: treat raw string as token directly (manual entry)
      token = raw.trim()
    }

    if (!token) {
      cooldownRef.current = false
      return
    }

    await redeem(token)

    // Reset after 3.5 seconds to allow next scan
    setTimeout(() => {
      cooldownRef.current = false
      if (state !== 'scanning') setState('scanning')
    }, 3500)
  }, [state])

  const redeem = async (token: string) => {
    setState('scanning')  // keep camera-active state during API call
    try {
      const res  = await fetch('/api/passes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      const data: ScanResult = await res.json()
      setResult(data)
      setState(
        data.success                                 ? 'success'
        : data.pass?.status === 'pending_renewal'   ? 'renewal'
        :                                             'denied'
      )
    } catch {
      setState('error')
    }
  }

  const handleManual = async () => {
    if (!manualInput.trim()) return
    await handleScan(manualInput.trim())
    setManualInput('')
  }

  // ── Result overlay ────────────────────────────────────────────────────
  const showOverlay = ['success', 'denied', 'renewal', 'error'].includes(state)

  const overlayBg = {
    success: '#0a2010',
    denied:  '#200a0a',
    renewal: '#201500',
    error:   '#1a1a1a',
  }[state as string] ?? 'var(--bw-surface)'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bw-black)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '48px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/dashboard" style={{ fontSize: 13, color: 'var(--bw-muted)', textDecoration: 'none' }}>← Dashboard</a>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>
          Door scanner
        </div>
        {state === 'scanning' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--bw-green)', boxShadow: '0 0 8px var(--bw-green)' }} />
            <span style={{ fontSize: 11, color: 'var(--bw-green)' }}>Live</span>
          </div>
        )}
        {state !== 'scanning' && <div style={{ width: 50 }} />}
      </div>

      {/* Camera viewport */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', maxHeight: 480 }}>
        <video
          ref={videoRef}
          style={{
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
            display:    state === 'starting' || state === 'scanning' ? 'block' : 'none',
            background: 'var(--bw-surface)',
          }}
          playsInline
          muted
        />

        {/* Scanner frame overlay */}
        {state === 'scanning' && (
          <div style={{
            position:  'absolute',
            inset:     0,
            display:   'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              width:  240,
              height: 240,
              position: 'relative',
            }}>
              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTop: '3px solid var(--bw-gold)', borderLeft: '3px solid var(--bw-gold)' },
                { top: 0, right: 0, borderTop: '3px solid var(--bw-gold)', borderRight: '3px solid var(--bw-gold)' },
                { bottom: 0, left: 0, borderBottom: '3px solid var(--bw-gold)', borderLeft: '3px solid var(--bw-gold)' },
                { bottom: 0, right: 0, borderBottom: '3px solid var(--bw-gold)', borderRight: '3px solid var(--bw-gold)' },
              ].map((style, i) => (
                <div key={i} style={{ position: 'absolute', width: 28, height: 28, borderRadius: 2, ...style }} />
              ))}

              {/* Scan line */}
              <div style={{
                position:   'absolute',
                left:       4,
                right:      4,
                height:     2,
                background: 'var(--bw-gold)',
                opacity:    0.7,
                animation:  'scanline 2s ease-in-out infinite',
              }} />
            </div>
            <style>{`
              @keyframes scanline {
                0%   { top: 4px;   opacity: 0.9; }
                50%  { top: 228px; opacity: 0.9; }
                100% { top: 4px;   opacity: 0.9; }
              }
            `}</style>
          </div>
        )}

        {/* Idle / starting states */}
        {(state === 'idle' || state === 'starting') && (
          <div style={{
            width:          '100%',
            height:         360,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            16,
            background:     'var(--bw-surface)',
          }}>
            <div style={{ fontSize: 48 }}>📷</div>
            {state === 'starting' ? (
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Starting camera…</div>
            ) : (
              <button className="btn btn-primary" onClick={startCamera} style={{ maxWidth: 220 }}>
                Start camera
              </button>
            )}
            {camError && (
              <div style={{ fontSize: 12, color: 'var(--bw-red)', textAlign: 'center', maxWidth: 260, padding: '0 20px' }}>
                {camError}
              </div>
            )}
          </div>
        )}

        {/* Result overlay */}
        {showOverlay && (
          <div style={{
            position:       'absolute',
            inset:          0,
            background:     overlayBg,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        24,
            transition:     'background 0.3s',
          }}>
            <div style={{ fontSize: 72, marginBottom: 12 }}>
              {state === 'success' ? '✅' : state === 'renewal' ? '⚠️' : '❌'}
            </div>
            <div style={{
              fontFamily:    'Bebas Neue, sans-serif',
              fontSize:      36,
              letterSpacing: '0.04em',
              color:         state === 'success' ? 'var(--bw-green)' : state === 'renewal' ? 'var(--bw-gold)' : 'var(--bw-red)',
              marginBottom:  12,
              lineHeight:    1,
            }}>
              {state === 'success' ? 'ENTRY GRANTED'
               : state === 'renewal' ? 'RENEWAL REQUIRED'
               : state === 'error'   ? 'SCAN ERROR'
               : 'ACCESS DENIED'}
            </div>

            {result && (
              <div style={{
                background:   'var(--bw-card)',
                border:       '1px solid var(--bw-border)',
                borderRadius: 12,
                padding:      '14px 18px',
                width:        '100%',
                maxWidth:     320,
              }}>
                {result.patron_name && (
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{result.patron_name}</div>
                )}
                {result.pass_type_label && (
                  <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Pass: {result.pass_type_label}</div>
                )}
                {result.time_window_label && (
                  <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Window: {result.time_window_label}</div>
                )}
                <div style={{
                  fontSize:    13,
                  marginTop:   10,
                  color:       state === 'success' ? 'var(--bw-green)' : state === 'renewal' ? 'var(--bw-gold)' : 'var(--bw-red)',
                  fontWeight:  600,
                }}>
                  {result.message}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 14 }}>
              Resuming in 3 seconds…
            </div>
          </div>
        )}
      </div>

      {/* Manual input fallback */}
      <div style={{ padding: '20px 20px 40px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
          Manual entry
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="input"
            placeholder="Paste pass token"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManual()}
            style={{ fontSize: 14 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleManual}
            disabled={!manualInput.trim() || cooldownRef.current}
            style={{ width: 'auto', padding: '0 20px', flexShrink: 0 }}
          >
            Go
          </button>
        </div>
      </div>
    </div>
  )
}
