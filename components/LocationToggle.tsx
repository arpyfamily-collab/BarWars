'use client'

/** "Show me on the War Map" opt-in (Testing To-Do item 5). */
import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { reportPosition } from '@/components/LocationReporter'

export default function LocationToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [atBar, setAtBar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [tester, setTester] = useState(false)
  const [bars, setBars] = useState<{ id: string; name: string }[]>([])
  const [placed, setPlaced] = useState<{ venue_id: string; bar: string | null; until: string } | null>(null)

  useEffect(() => {
    fetch('/api/location').then(r => r.json()).then(d => {
      setEnabled(!!d?.enabled); setAtBar(d?.at_bar ?? null)
      setTester(!!d?.tester); setBars(d?.bars ?? []); setPlaced(d?.placed ?? null)
    }).catch(() => setEnabled(false))
  }, [])

  async function save(on: boolean) {
    await fetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) })
    window.dispatchEvent(new Event('bw-location-changed'))
  }

  async function toggle() {
    setBusy(true); setNote(null)
    try {
      if (enabled) {
        await save(false); setEnabled(false); setAtBar(null); setPlaced(null)
        return
      }
      await save(true)
      try {
        const r = await reportPosition()   // asks for location permission the first time
        setEnabled(true)
        setAtBar(r?.at_bar ?? null)
        if (!r?.at_bar) setNote("You'll show up when you're at a participating bar on the Square.")
      } catch {
        await save(false); setEnabled(false)
        setNote('Location is off for BarWars. Turn it on in Settings > BarWars > Location ("While Using the App").')
      }
    } finally { setBusy(false) }
  }

  // Testers (item 6): place yourself at a bar from anywhere, for up to 3 hours
  async function place(venueId: string) {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place_venue_id: venueId || null }) })
      const d = await res.json()
      if (!res.ok) { setNote(d.error || 'Could not place you'); return }
      setPlaced(d.placed)
      if (d.placed) { setEnabled(true); setAtBar(d.placed.bar) } else { setAtBar(null) }
      window.dispatchEvent(new Event('bw-location-changed'))
    } finally { setBusy(false) }
  }

  if (enabled === null) return null
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <MapPin size={16} style={{ color: enabled ? 'var(--bw-green)' : 'var(--bw-muted)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Show me on the War Map</div>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
              {enabled ? (atBar ? `You're showing at ${atBar}` : 'On. You show up when you’re at a bar on the Square') : 'Off'}
            </div>
          </div>
        </div>
        <button className="btn" disabled={busy} onClick={toggle} role="switch" aria-checked={!!enabled}
          style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0, ...(enabled ? { color: 'var(--bw-green)', borderColor: 'rgba(46,204,113,0.4)' } : {}) }}>
          {busy ? '…' : enabled ? 'On' : 'Turn on'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
        Others see your skin at the bar you&apos;re in, never your name or exact spot. Only while the app is open. Turn it off any time.
      </div>
      {tester && (
        <div style={{ borderTop: '1px solid var(--bw-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-cyan)' }}>Tester: place me at</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input" value={placed?.venue_id ?? ''} disabled={busy} onChange={e => place(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
              <option value="">Use my real location</option>
              {bars.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
            {placed ? `Showing at ${placed.bar} until ${new Date(placed.until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} while the app is open.` : 'Testing only: shows you on the map at that bar from anywhere. Never counts toward wars or rewards.'}
          </div>
        </div>
      )}
      {note && <div style={{ fontSize: 12, color: 'var(--bw-flare)' }}>{note}</div>}
    </div>
  )
}
