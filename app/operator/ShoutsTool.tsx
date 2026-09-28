'use client'

/** Staff tool: moderate Watch Link Shouts (Testing To-Do item 18). Hidden automatically at 3 reports. */
import { useCallback, useEffect, useState } from 'react'

export default function ShoutsTool() {
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch('/api/operator/shouts').then(r => r.json()).then(d => { if (Array.isArray(d)) setRows(d) }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'remove' | 'restore') {
    setBusy(id)
    await fetch('/api/operator/shouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shout_id: id, action }) })
    setBusy(null); load()
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>Watch Link Shouts</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>Public Shouts from spectators. Hidden automatically at 3 reports; remove or restore here.</div>
      {rows.length === 0 ? <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>No Shouts yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const hidden = !!r.removed_at || r.report_count >= 3
            return (
              <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: r.removed_at ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{r.content}</div>
                  <div style={{ fontSize: 11, color: r.report_count ? 'var(--bw-red)' : 'var(--bw-muted)' }}>
                    War at {r.bar ?? 'a bar'} · {r.report_count} report{r.report_count === 1 ? '' : 's'}{r.removed_at ? ' · removed' : hidden ? ' · hidden' : ''}
                  </div>
                </div>
                {!r.removed_at && <button className="btn" disabled={busy === r.id} style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => act(r.id, 'remove')}>Remove</button>}
                {hidden && <button className="btn" disabled={busy === r.id} style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => act(r.id, 'restore')}>Restore</button>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
