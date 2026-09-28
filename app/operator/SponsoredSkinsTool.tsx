'use client'

/** Staff: create bar-sponsored skins (item 21). Unlocked only by fighting a war at that bar. */
import { useCallback, useEffect, useState } from 'react'

export default function SponsoredSkinsTool() {
  const [d, setD] = useState<any>(null)
  const [f, setF] = useState<any>({ name: '', description: '', venue_id: '', rarity: 'rare', max_supply: 100, days: 90 })
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => { fetch('/api/operator/sponsored-skins').then(r => r.json()).then(setD).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  async function post(body: any) {
    const r = await fetch('/api/operator/sponsored-skins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Failed')
    return j
  }

  if (!d?.venues) return null
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>Bar-sponsored skins</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>Players unlock one by checking in at the sponsoring bar during a live war there. Never sold.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        <input className="input" placeholder="Skin name, e.g. Library Champion" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Description (optional)" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="input" value={f.venue_id} onChange={e => setF({ ...f, venue_id: e.target.value })}>
            <option value="">Sponsoring bar…</option>
            {d.venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select className="input" value={f.rarity} onChange={e => setF({ ...f, rarity: e.target.value })}>
            {['common', 'rare', 'epic', 'legendary'].map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: 12 }}>Supply<input className="input" type="number" min={1} value={f.max_supply} onChange={e => setF({ ...f, max_supply: e.target.value })} /></label>
          <label style={{ flex: 1, fontSize: 12 }}>Season (days)<input className="input" type="number" min={1} max={365} value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></label>
        </div>
        <button className="btn btn-primary" disabled={!f.name.trim() || !f.venue_id}
          onClick={async () => { setMsg(null); try { await post({ action: 'create', ...f }); setMsg('Skin created.'); setF({ ...f, name: '', description: '' }); load() } catch (e: any) { setMsg(e.message) } }}>
          Create sponsored skin
        </button>
        {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)' }}>{msg}</div>}
      </div>
      {d.skins.map((s: any) => (
        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--bw-border)', opacity: s.active ? 1 : 0.5 }}>
          <div style={{ flex: 1 }}>{s.name} · {s.venue?.name} · {s.sold_count}/{s.max_supply ?? '∞'} unlocked · until {s.available_until ? new Date(s.available_until).toLocaleDateString() : 'no end'}</div>
          <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => post({ action: 'toggle', skin_id: s.id, active: !s.active }).then(load)}>{s.active ? 'Turn off' : 'Turn on'}</button>
        </div>
      ))}
    </div>
  )
}
