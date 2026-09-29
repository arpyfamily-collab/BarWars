'use client'

/** Staff: barwars.app waitlist signups, with a CSV download for the launch email. */
import { useEffect, useState } from 'react'

export default function WaitlistTool() {
  const [d, setD] = useState<{ count: number; recent: any[] } | null>(null)
  useEffect(() => { fetch('/api/operator/waitlist').then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [])
  if (!d) return null
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>
          Website waitlist · {d.count} signup{d.count === 1 ? '' : 's'}
        </div>
        <a className="btn" href="/api/operator/waitlist?format=csv" style={{ fontSize: 12 }}>Download CSV</a>
      </div>
      {d.recent.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          {d.recent.map((r: any) => (
            <div key={r.email} style={{ display: 'flex', gap: 8, padding: '3px 0', borderTop: '1px solid var(--bw-border)' }}>
              <span style={{ flex: 1 }}>{r.email}</span>
              <span style={{ color: 'var(--bw-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
