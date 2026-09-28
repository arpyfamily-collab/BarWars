'use client'

/**
 * Door Mode (Brian, Sep 28): one screen for the bouncer. Scan the voucher on the player's phone (camera,
 * a Bluetooth/USB scanner, or type the 6-character code) and get a big green or red answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { scanQrCode } from '@/lib/scan-qr'

export default function DoorPage() {
  const [venues, setVenues] = useState<any[] | null>(null)
  const [venue, setVenue] = useState<string>('')
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<{ ok: boolean; title: string; sub: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch('/api/door', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setVenues(d.venues ?? []); if (!venue && d.venues?.length) setVenue(d.venues[0].id)
    }).catch(() => setVenues([]))
  }, [venue])
  useEffect(() => { load() }, [load])

  async function check(payload: string) {
    if (!payload.trim() || !venue) return
    setBusy(true); setResult(null)
    const r = await fetch('/api/door', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id: venue, payload: payload.trim() }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setTyped('')
    const good = r.ok && j.ok
    setResult(good ? { ok: true, title: `✓ ${j.offer}`, sub: `${j.bar} · marked used` } : { ok: false, title: '✕ Not valid', sub: j.reason || j.error || 'Try again' })
    try { navigator.vibrate?.(good ? 80 : [80, 60, 80]) } catch {}
    load(); inputRef.current?.focus()
  }

  if (venues === null) return null
  if (venues.length === 0) return (
    <div className="page"><div className="page-content" style={{ paddingTop: 48, textAlign: 'center', color: 'var(--bw-muted)' }}>Door Mode is for bar door staff. Ask your manager for a door-staff link.</div></div>
  )
  const v = venues.find(x => x.id === venue)

  return (
    <div className="page" style={{ minHeight: '100dvh' }}><div className="page-content" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, flex: 1 }}>🚪 Door Mode</div>
        {venues.length > 1
          ? <select className="input" style={{ width: 'auto' }} value={venue} onChange={e => setVenue(e.target.value)}>{venues.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          : <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>{v?.name}</div>}
      </div>

      <button className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '28px 0', fontSize: 20 }}
        onClick={async () => { try { const raw = await scanQrCode(); if (raw) await check(raw); else setResult({ ok: false, title: 'No code read', sub: 'Try again, or type the code under their QR.' }) } catch { setResult({ ok: false, title: 'Camera error', sub: 'Type the code instead.' }) } }}>
        {busy ? 'Checking…' : '📷 Scan bracelet'}
      </button>

      <form onSubmit={e => { e.preventDefault(); check(typed) }} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input ref={inputRef} className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Or type the 6-character code (scanners type here)"
          autoCapitalize="characters" autoComplete="off" style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }} />
        <button className="btn" type="submit" disabled={busy || !typed.trim()}>Check</button>
      </form>

      {result && (
        <div onClick={() => setResult(null)} style={{ marginTop: 16, borderRadius: 16, padding: '36px 16px', textAlign: 'center', cursor: 'pointer',
          background: result.ok ? 'rgba(34,197,94,0.18)' : 'rgba(224,49,49,0.18)', border: `2px solid ${result.ok ? '#22C55E' : '#E03131'}` }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: result.ok ? '#22C55E' : '#E03131' }}>{result.title}</div>
          <div style={{ fontSize: 15, marginTop: 6 }}>{result.sub}</div>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', textAlign: 'center', marginTop: 16 }}>{v?.redeemed_tonight ?? 0} bracelet{(v?.redeemed_tonight ?? 0) === 1 ? '' : 's'} redeemed tonight</div>
    </div></div>
  )
}
