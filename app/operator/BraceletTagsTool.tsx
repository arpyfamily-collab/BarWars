'use client'

/** Staff: print band tags for a bar (Brian, Sep 28). The bar scans each one in when the pack arrives. */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function BraceletTagsTool() {
  const [venues, setVenues] = useState<any[] | null>(null)
  const [venue, setVenue] = useState('')
  const [count, setCount] = useState(10)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { fetch('/api/operator/bracelet-tags').then(r => r.ok ? r.json() : null).then(d => d && setVenues(d.venues)).catch(() => {}) }, [])
  if (!venues) return null

  async function print() {
    setMsg(null)
    const r = await fetch('/api/operator/bracelet-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id: venue, count }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error); return }
    const bar = venues!.find(v => v.id === venue)?.name ?? ''
    const cells = await Promise.all(j.tags.map(async (t: any) =>
      `<div class="t"><img src="${await QRCode.toDataURL(t.url, { width: 220, margin: 1 })}"/><div class="c">${t.code.slice(-8).toUpperCase()}</div><div class="b">BarWars</div></div>`))
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>BarWars band tags · ${bar}</title><style>
      body{font-family:sans-serif;margin:16px} h1{font-size:14px} .g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .t{border:1px dashed #999;border-radius:6px;padding:8px;text-align:center;break-inside:avoid} .t img{width:100%}
      .c{font:700 12px monospace;letter-spacing:2px} .b{font-size:10px;color:#666}</style></head>
      <body><h1>${bar} · ${j.tags.length} band tags · scan each in at the Command Center (Bracelets → Receive)</h1><div class="g">${cells.join('')}</div></body></html>`)
    w.document.close(); w.focus(); w.print()
    setMsg(`${j.tags.length} tags created for ${bar}.`)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>Print bracelet tags</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="input" value={venue} onChange={e => setVenue(e.target.value)}>
          <option value="">Bar…</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input className="input" type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: 80 }} />
        <button className="btn btn-primary" disabled={!venue} onClick={print}>Print</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
