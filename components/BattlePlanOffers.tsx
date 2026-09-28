'use client'

/** War page: Battle Plan offers bars fired for this war tonight (item 19). Fighters who checked in claim a code. */
import { useCallback, useEffect, useState } from 'react'

export default function BattlePlanOffers({ claimId }: { claimId: string }) {
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/battle-plans?claim_id=${claimId}`, { cache: 'no-store' })
    if (r.ok) setD(await r.json())
  }, [claimId])
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t) }, [load])

  if (!d?.offers?.length) return null
  async function claim(id: string) {
    setMsg(null)
    const r = await fetch('/api/battle-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firing_id: id }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(j.error || 'Could not claim'); else load()
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-gold)', marginBottom: 8 }}>⚔️ Battle Plans fired</div>
      {d.offers.map((o: any) => (
        <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bw-border)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{o.offer}{o.is_drink ? ' · 21+, bring ID' : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>at {o.bar}{o.details ? ` · ${o.details}` : ''}</div>
          {o.code ? (
            <div style={{ marginTop: 6, fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.25em', color: o.redeemed ? 'var(--bw-muted)' : 'var(--bw-gold)' }}>
              {o.code} <span style={{ fontSize: 12, letterSpacing: 0, fontFamily: 'inherit' }}>{o.redeemed ? 'used' : 'show this at the door'}</span>
            </div>
          ) : o.left <= 0 ? <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 4 }}>All claimed.</div>
            : d.checked_in ? <button className="btn btn-primary" style={{ marginTop: 6, fontSize: 12 }} onClick={() => claim(o.id)}>Claim ({o.left} left)</button>
            : <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 4 }}>Check in to the war to claim ({o.left} left).</div>}
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-red)', marginTop: 6 }}>{msg}</div>}
    </div>
  )
}
