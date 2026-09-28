'use client'

/** Staff: flagged Ghost reports, judged against the war's real check-ins (item 12 leftover). */
import { useCallback, useEffect, useState } from 'react'

export default function GhostFlagsTool() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => { fetch('/api/operator/ghost-flags').then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'fake' | 'dismiss') {
    if (action === 'fake' && !confirm('Rule this report fake? Every buyer gets their Valor back, and 2 fakes suspend the Ghost.')) return
    const r = await fetch('/api/operator/ghost-flags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_id: id, action }) })
    const j = await r.json().catch(() => ({}))
    setMsg(!r.ok ? j.error : action === 'fake' ? `Ruled fake: ${j.refunded} buyer(s) refunded${j.ghost_suspended ? '; Ghost suspended' : ''}.` : 'Flag dismissed.')
    load()
  }

  if (rows === null) return null
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>Flagged Ghost reports</div>
      {rows.length === 0 ? <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Nothing flagged.</div> : rows.map(r => {
        const c = r.report?.claim
        return (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bw-border)', fontSize: 13 }}>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
              {r.report?.ghost?.codename ?? 'Ghost'} · {r.record?.reports ?? 0} reports, {r.record?.ruled_fake ?? 0} ruled fake{r.record?.rating ? `, rated ${r.record.rating}` : ''}{r.report?.ghost?.suspended_at ? ' · SUSPENDED' : ''}
            </div>
            <div style={{ margin: '4px 0' }}>&ldquo;{r.report?.observation}&rdquo;{r.report?.headcount_estimate != null ? ` (estimated ${r.report.headcount_estimate} there)` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
              War at {r.report?.bar?.name ?? 'a bar'}: {c?.attacker?.name ?? '?'} {Number(c?.attacker_weighted_headcount ?? 0)} vs {c?.defender?.name ?? 'bar'} {Number(c?.defender_weighted_headcount ?? 0)} checked in{c?.result ? ` · ${c.result}` : ` · ${c?.status}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-red)', margin: '4px 0' }}>Buyer&apos;s flag: {r.flag_note} (paid {r.price} Valor{r.exclusive ? ', exclusive' : ''})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--bw-red)' }} onClick={() => act(r.id, 'fake')}>Rule fake + refund</button>
              <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => act(r.id, 'dismiss')}>Dismiss</button>
            </div>
          </div>
        )
      })}
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
