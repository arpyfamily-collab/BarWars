'use client'

/**
 * Bar Command Center → staff spies (item 11). Invite an employee privately; they can play as a Ghost,
 * spy or support mercenary without a university email. Never shown anywhere in the student app.
 */
import { useCallback, useEffect, useState } from 'react'

const C = { panel: '#111114', border: 'rgba(255,255,255,0.06)', dim: '#9CA3AF', gold: '#C9A84C', green: '#22C55E', red: '#E03131' }
const small: React.CSSProperties = { padding: '6px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.dim, fontSize: 12, cursor: 'pointer' }
const input: React.CSSProperties = { flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, color: '#F5F5F5', fontSize: 14 }

export default function StaffSpiesPanel({ venueId }: { venueId: string }) {
  const [invites, setInvites] = useState<any[]>([])
  const [name, setName] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch(`/api/bar-admin/staff-invites?venue_id=${venueId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => d && setInvites(d.invites)).catch(() => {})
  }, [venueId])
  useEffect(() => { load() }, [load])

  async function post(body: any) {
    const r = await fetch('/api/bar-admin/staff-invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id: venueId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Failed')
    return j
  }

  const status = (i: any) => i.revoked_at ? 'revoked' : i.used_at ? 'joined' : new Date(i.expires_at) < new Date() ? 'expired' : 'waiting'
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>🕵️ Staff spies</div>
      <div style={{ fontSize: 12, color: C.dim, margin: '4px 0 10px' }}>
        Invite an employee to play as a Ghost, spy or support mercenary. Send the link privately; it works once, for 72 hours. 3 per semester. Players can&apos;t tell a staff spy from anyone else.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Employee's name" />
        <button style={{ ...small, color: C.gold, borderColor: C.gold }} disabled={name.trim().length < 2}
          onClick={async () => { setMsg(null); setLink(null); try { const j = await post({ action: 'create', name }); setLink(j.link); setName(''); load() } catch (e: any) { setMsg(e.message) } }}>
          Create link
        </button>
      </div>
      {link && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ wordBreak: 'break-all', color: C.green }}>{link}</div>
          <button style={{ ...small, marginTop: 6 }} onClick={async () => {
            try { if ((navigator as any).share) await (navigator as any).share({ url: link }); else { await navigator.clipboard.writeText(link); setMsg('Copied.') } } catch {}
          }}>Share privately</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{msg}</div>}
      {invites.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.border}`, marginTop: 8, fontSize: 13 }}>
          <div style={{ flex: 1 }}>{i.employee_name} <span style={{ color: C.dim }}>· {status(i)}</span></div>
          {!i.revoked_at && <button style={small} onClick={() => { if (confirm(`Revoke ${i.employee_name}? They lose staff-spy access.`)) post({ action: 'revoke', invite_id: i.id }).then(load) }}>Revoke</button>}
        </div>
      ))}
    </div>
  )
}
