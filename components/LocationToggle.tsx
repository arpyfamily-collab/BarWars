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

  useEffect(() => {
    fetch('/api/location').then(r => r.json()).then(d => { setEnabled(!!d?.enabled); setAtBar(d?.at_bar ?? null) }).catch(() => setEnabled(false))
  }, [])

  async function save(on: boolean) {
    await fetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) })
    window.dispatchEvent(new Event('bw-location-changed'))
  }

  async function toggle() {
    setBusy(true); setNote(null)
    try {
      if (enabled) {
        await save(false); setEnabled(false); setAtBar(null)
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
      {note && <div style={{ fontSize: 12, color: 'var(--bw-flare)' }}>{note}</div>}
    </div>
  )
}
