'use client'

/** My Bracelets (Brian, Sep 28): each bracelet is a voucher for its night; show it at the door. */
import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import BottomNav from '@/components/BottomNav'

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export default function MyBraceletsPage() {
  const [list, setList] = useState<any[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [code, setCode] = useState<{ code: string; img: string; left: number } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => { fetch('/api/bracelets', { cache: 'no-store' }).then(r => r.json()).then(d => setList(d.bracelets ?? [])).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])

  // While a voucher is open, refresh its code every few seconds (it rotates every 30)
  useEffect(() => {
    if (!open) { setCode(null); return }
    let stop = false
    const tick = async () => {
      const r = await fetch(`/api/bracelets/${open}/code`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (stop) return
      if (!r.ok) { setMsg(j.error || 'Could not load the code'); setOpen(null); load(); return }
      setCode({ code: j.code, img: await QRCode.toDataURL(j.payload, { width: 320, margin: 1 }), left: j.seconds_left })
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { stop = true; clearInterval(t) }
  }, [open, load])

  const label = (b: any) => b.offer_type === 'no_cover' ? 'No cover' : b.offer_type === 'drink' ? `${b.offer_value ?? 'Drink offer'} · 21+` : (b.offer_value ?? 'Offer')
  const when = (b: any) => !b.valid_night ? 'Any night' : b.valid_nights > 1 ? `${fmt(b.valid_night)} + ${b.valid_nights - 1} more night${b.valid_nights > 2 ? 's' : ''}` : fmt(b.valid_night)

  return (
    <div className="page"><div className="page-content" style={{ paddingTop: 24 }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>My Bracelets</div>
      <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 14 }}>Each bracelet is good for its night. At the door, open it and let staff scan the code. Can&apos;t make it? Donate it to the Armory before its night.</div>
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-red)', marginBottom: 10 }}>{msg}</div>}
      {list === null ? null : list.length === 0 ? <div className="card" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>No bracelets yet. Find one in the Bracelet Hunt or claim one from the Armory.</div>
        : list.map(b => (
          <div key={b.id} className="card" style={{ marginBottom: 10, opacity: b.state === 'used' || b.state === 'expired' ? 0.5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>🎁 {label(b)} · {b.bar}</div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{when(b)} · {b.state === 'tonight' ? 'good tonight' : b.state === 'upcoming' ? 'coming up' : b.state === 'escrow' ? 'held as payment on a contract' : b.state === 'used' ? 'used' : 'expired'}</div>
              </div>
              {b.state === 'tonight' && <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? 'Hide' : 'Show at door'}</button>}
            </div>
            {open === b.id && code && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <img src={code.img} alt="Door code" style={{ width: 240, height: 240, background: '#fff', borderRadius: 8 }} />
                <div style={{ fontSize: 28, letterSpacing: '0.3em', fontWeight: 800, marginTop: 8 }}>{code.code}</div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Changes every 30 seconds. Screenshots won&apos;t work.</div>
              </div>
            )}
          </div>
        ))}
    </div><BottomNav /></div>
  )
}
