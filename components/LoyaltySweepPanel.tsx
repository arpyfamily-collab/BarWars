'use client'

/** Spies page, leaders only (item 24): order a loyalty sweep and see counts, never names. */
import { useCallback, useEffect, useState } from 'react'

export default function LoyaltySweepPanel() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    fetch('/api/turf-wars/spies/loyalty').then(r => r.json()).then(d => setOrgs(d?.orgs ?? [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  if (!orgs.length) return null

  async function sweep(orgId: string) {
    if (!confirm('Send fake spy approaches to a random quarter of your members? They look exactly like real ones. One sweep every 30 days.')) return
    setBusy(true); setMsg(null)
    const r = await fetch('/api/turf-wars/spies/loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId }) })
    const j = await r.json().catch(() => ({}))
    setMsg(j.message || j.error || null); setBusy(false); load()
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8 }}>Loyalty sweep</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>
        Fake spy approaches go to a random quarter of your members. Accepting flags someone as susceptible; reporting earns them High Loyalty. You see counts, never names.
      </div>
      {orgs.map(o => {
        const canSweep = !o.next_sweep_at || new Date(o.next_sweep_at).getTime() <= Date.now()
        return (
          <div key={o.org_id} style={{ marginBottom: 8 }}>
            {orgs.length > 1 && <div style={{ fontWeight: 700, fontSize: 13 }}>{o.org_name}</div>}
            {o.last && (
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Last sweep {new Date(o.last_sweep_at).toLocaleDateString()}: {o.last.sent} sent · <b style={{ color: 'var(--bw-red)' }}>{o.last.accepted} took the bait</b> · <b style={{ color: 'var(--bw-green)' }}>{o.last.reported} reported it</b> · {o.last.ignored} ignored · {o.last.pending} haven&apos;t answered
              </div>
            )}
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={busy || !canSweep} onClick={() => sweep(o.org_id)}>
              {canSweep ? 'Order a loyalty sweep' : `Next sweep ${new Date(o.next_sweep_at).toLocaleDateString()}`}
            </button>
          </div>
        )
      })}
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)' }}>{msg}</div>}
    </div>
  )
}
