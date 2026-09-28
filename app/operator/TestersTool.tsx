'use client'

/** Staff tool: tester accounts (Testing To-Do item 6). Testers can place themselves at a bar
 *  on the War Map from anywhere; turn them all off in one tap before launch. */
import { useEffect, useState } from 'react'

interface Tester { id: string; email: string | null; name: string }

export default function TestersTool() {
  const [testers, setTesters] = useState<Tester[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { fetch('/api/operator/testers').then(r => r.json()).then(d => { if (Array.isArray(d)) setTesters(d) }).catch(() => {}) }, [])

  async function post(body: any, okText: (d: any) => string) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/operator/testers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: d.error || 'Something went wrong' }); return }
      setTesters(d.testers ?? []); setMsg({ ok: true, text: okText(d) }); setEmail('')
    } catch { setMsg({ ok: false, text: 'Network error. Try again.' }) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>Testers</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Testers can place themselves at a bar on the War Map from anywhere (&quot;Tester: place me at&quot; under &quot;Show me on the War Map&quot;). It only puts a dot on the map; it never counts toward wars, leaderboards or rewards.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="player@email.com" style={{ flex: 1, fontSize: 13 }} />
        <button className="btn btn-primary" disabled={busy || !email.trim()} style={{ fontSize: 12, padding: '6px 12px' }}
          onClick={() => post({ email, on: true }, d => `${d.email} is a tester.`)}>Add tester</button>
      </div>
      {testers.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>No testers.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {testers.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span>{t.name} <span style={{ color: 'var(--bw-muted)', fontSize: 11 }}>{t.email}</span></span>
              <button className="btn" disabled={busy} style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => post({ email: t.email, on: false }, d => `${d.email} is no longer a tester.`)}>Remove</button>
            </div>
          ))}
          <button className="btn" disabled={busy} style={{ marginTop: 6, fontSize: 12, color: 'var(--bw-red)', borderColor: 'rgba(224,49,49,0.35)' }}
            onClick={() => { if (confirm(`Turn off all ${testers.length} testers? Their map placements end now.`)) post({ all_off: true }, d => `Turned off ${d.turned_off} testers.`) }}>
            Turn off all testers (before launch)
          </button>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.ok ? 'var(--bw-green)' : 'var(--bw-red)' }}>{msg.text}</div>}
    </div>
  )
}
