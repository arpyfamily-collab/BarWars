'use client'

/**
 * Bar Command Center: the door QR (item 22 follow-up). Print it and put it inside, past the door.
 * Players scan it to count in full; standing in line counts at half. Reset it if a photo gets around.
 */
import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'

const C = { panel: '#111114', border: 'rgba(255,255,255,0.06)', dim: '#9CA3AF', gold: '#C9A84C' }
const small: React.CSSProperties = { padding: '6px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.dim, fontSize: 12, cursor: 'pointer' }

export default function DoorQrPanel({ venueId }: { venueId: string }) {
  const [d, setD] = useState<{ name: string; code: string } | null>(null)
  const [img, setImg] = useState<string | null>(null)
  const url = (code: string) => `https://app.barwars.app/scan/${code}`

  const load = useCallback(async () => {
    const r = await fetch(`/api/bar-admin/door-code?venue_id=${venueId}`, { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json(); setD(j)
    setImg(await QRCode.toDataURL(url(j.code), { width: 480, margin: 2, errorCorrectionLevel: 'M' }))
  }, [venueId])
  useEffect(() => { load() }, [load])

  async function reset() {
    if (!confirm('Make a new code? The old QR stops working right away, so print and put up the new one.')) return
    await fetch('/api/bar-admin/door-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id: venueId }) })
    load()
  }

  function print() {
    if (!d || !img) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>BarWars door QR</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0">${d.name}</h1><p style="font-size:20px">Turf War tonight? Scan to check in at full strength.</p>
      <img src="${img}" style="width:360px;height:360px"/><p style="font-size:28px;letter-spacing:6px;font-weight:700">${d.code}</p>
      <p style="color:#666">Open BarWars → your war → Scan QR. Or type the code above.</p></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (!d) return null
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, padding: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {img && <img src={img} alt="Door QR" style={{ width: 120, height: 120, background: '#fff', borderRadius: 6 }} />}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>📲 Door QR</div>
        <div style={{ fontSize: 12, color: C.dim, margin: '4px 0 8px' }}>Put this up inside, past the door. Players scan it to count in full for their side; in line they count at half.</div>
        <div style={{ fontSize: 22, letterSpacing: '0.25em', fontWeight: 700, marginBottom: 8 }}>{d.code}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={small} onClick={print}>Print</button>
          <button style={small} onClick={reset}>New code</button>
        </div>
      </div>
    </div>
  )
}
