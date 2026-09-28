'use client'

/** Staff: university-email gate switch (off during TestFlight) and every bar-sponsored staff account (item 11). */
import { useCallback, useEffect, useState } from 'react'

export default function EduGateTool() {
  const [d, setD] = useState<any>(null)
  const load = useCallback(() => { fetch('/api/operator/edu-gate').then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  if (!d) return null
  async function toggle() {
    const on = !d.gate.enabled
    if (!confirm(on ? 'Turn the Ole Miss email gate ON? Anyone without a confirmed Ole Miss login can no longer join orgs or companies, check in to wars, or take Ghost, spy or mercenary roles (bar-sponsored staff keep Ghost, spy and support work).' : 'Turn the gate OFF?')) return
    await fetch('/api/operator/edu-gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) })
    load()
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>University email gate</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13 }}>
          {d.gate.enabled ? '🔒 ON' : '🔓 OFF'} · allowed: {(d.gate.domains ?? []).map((x: string) => `@${x} (and subdomains)`).join(', ')}
          <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Staff and testers always pass.</div>
        </div>
        <button className="btn" style={{ fontSize: 12 }} onClick={toggle}>{d.gate.enabled ? 'Turn off' : 'Turn on'}</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', margin: '14px 0 6px' }}>Bar-sponsored staff</div>
      {d.sponsored.length === 0 ? <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>None yet.</div> : d.sponsored.map((r: any) => (
        <div key={r.user_id} style={{ fontSize: 12, padding: '4px 0', opacity: r.revoked_at ? 0.5 : 1 }}>
          {r.invite?.employee_name ?? 'Employee'} · {r.email ?? ''} · {r.venue?.name ?? ''}{r.revoked_at ? ' · revoked' : ''}
        </div>
      ))}
    </div>
  )
}
