'use client'

/** Spies page, Ghosts only (item 18 Phase 2): one wiretap per war, 10 minutes on one side's chat, no names. */
import { useCallback, useEffect, useState } from 'react'

export default function GhostWiretapPanel() {
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => { fetch('/api/turf-wars/spies/wiretap', { cache: 'no-store' }).then(r => r.json()).then(setD).catch(() => {}) }, [])
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load])
  if (!d?.ghost || !d.wars?.length) return null

  async function tap(claimId: string, side: string) {
    if (!confirm(`Use your one wiretap for this war on the ${side} chat? It runs 10 minutes.`)) return
    const r = await fetch('/api/turf-wars/spies/wiretap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim_id: claimId, side }) })
    const j = await r.json().catch(() => ({}))
    setMsg(j.message || j.error || null); load()
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--bw-cyan)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-cyan)', marginBottom: 6 }}>🎧 Wiretap</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>One per war: listen to one side&apos;s war chat for 10 minutes. No names come through. Use what you hear in your reports.</div>
      {d.wars.map((w: any) => {
        const live = w.wiretap && new Date(w.wiretap.ends_at).getTime() > Date.now()
        return (
          <div key={w.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bw-border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{w.attacker} vs {w.defender} · {w.bar}</div>
            {!w.wiretap ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => tap(w.id, 'attacker')}>Tap {w.attacker}</button>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => tap(w.id, 'defender')}>Tap {w.defender}</button>
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11, color: live ? 'var(--bw-green)' : 'var(--bw-muted)' }}>
                  {live ? `Listening to the ${w.wiretap.side} chat until ${new Date(w.wiretap.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `Wiretap on the ${w.wiretap.side} chat is over`}
                </div>
                {(w.wiretap.messages ?? []).length === 0 ? <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Nothing picked up yet.</div>
                  : w.wiretap.messages.map((m: any, i: number) => (
                    <div key={i} style={{ fontSize: 12, padding: '3px 0', fontWeight: m.command ? 700 : 400 }}>
                      <span style={{ color: 'var(--bw-muted)' }}>{new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} </span>{m.content}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
