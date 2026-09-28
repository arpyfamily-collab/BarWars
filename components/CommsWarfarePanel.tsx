'use client'

/**
 * War page → Comms Warfare (item 18 Phase 2). Shows what's frozen and the moves this player has:
 * Jam (a side's spies and hired mercenaries), Command orders (leaders), Forged orders (moles).
 * Renders nothing for players with no moves while nothing is frozen.
 */
import { useCallback, useEffect, useState } from 'react'

const ORDERS = [
  { id: 'regroup', label: 'Regroup at…', bar: true },
  { id: 'fall_back', label: 'Fall back to…', bar: true },
  { id: 'push', label: 'Push to…', bar: true },
  { id: 'hold', label: 'Hold position', bar: false },
]
const until = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''

export default function CommsWarfarePanel({ claimId }: { claimId: string }) {
  const [s, setS] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tpl, setTpl] = useState('regroup')
  const [bar, setBar] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/turf-wars/${claimId}/comms`, { cache: 'no-store' })
    if (r.ok) setS(await r.json())
  }, [claimId])
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load])

  async function act(body: any) {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/turf-wars/${claimId}/comms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setMsg(j.message || j.error || null); setBusy(false); load()
  }

  if (!s) return null
  const canJam = s.jam_side && s.jams_left > 0
  const canForge = s.is_mole && s.forgeries_left > 0
  const frozen = s.blackout_until || s.attacker_frozen_until || s.defender_frozen_until || s.attacker_static_until || s.defender_static_until
  if (!canJam && !s.is_leader && !canForge && !frozen) return null
  const needsBar = ORDERS.find(o => o.id === tpl)?.bar

  const orderForm = (action: 'order' | 'forge', label: string) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <select className="input" style={{ flex: 1, minWidth: 130 }} value={tpl} onChange={e => setTpl(e.target.value)}>
        {ORDERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {needsBar && (
        <select className="input" style={{ flex: 1, minWidth: 130 }} value={bar} onChange={e => setBar(e.target.value)}>
          <option value="">Bar…</option>
          {(s.bars ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={busy || (needsBar && !bar)}
        onClick={() => act({ action, template: tpl, bar_id: needsBar ? bar : undefined })}>{label}</button>
    </div>
  )

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--bw-cyan)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-cyan)', marginBottom: 8 }}>📡 Comms warfare</div>
      {s.blackout_until && <div style={{ fontSize: 13, marginBottom: 6 }}>⚡ Flare blackout: every war chat is down until {until(s.blackout_until)}.</div>}
      {!s.blackout_until && s.attacker_frozen_until && <div style={{ fontSize: 13, marginBottom: 6 }}>📵 Attacker chat jammed until {until(s.attacker_frozen_until)}.</div>}
      {!s.blackout_until && s.defender_frozen_until && <div style={{ fontSize: 13, marginBottom: 6 }}>📵 Defender chat jammed until {until(s.defender_frozen_until)}.</div>}

      {!s.blackout_until && s.attacker_static_until && <div style={{ fontSize: 13, marginBottom: 6 }}>▒ Static on the attacker chat until {until(s.attacker_static_until)}.</div>}
      {!s.blackout_until && s.defender_static_until && <div style={{ fontSize: 13, marginBottom: 6 }}>▒ Static on the defender chat until {until(s.defender_static_until)}.</div>}
      {s.jam_side && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 6 }}>
            Hit the {s.jam_side === 'attacker' ? 'defenders' : 'attackers'} for {s.jam_side === 'attacker' ? 5 : 10} min: a jam silences their chat, static garbles half their words. {s.jams_left} left for your side (jam or static).
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ fontSize: 12 }} disabled={busy || !canJam} onClick={() => act({ action: 'jam' })}>📵 Jam</button>
            <button className="btn" style={{ fontSize: 12 }} disabled={busy || !canJam} onClick={() => act({ action: 'static' })}>▒ Static</button>
          </div>
        </div>
      )}
      {s.is_leader && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Command order to your side. Enemy moles can forge these; your intel cell can decrypt 2 per war.</div>
          {orderForm('order', 'Send order')}
        </div>
      )}
      {canForge && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>🕵️ Forge an order into the chat you&apos;re planted in ({s.forgeries_left} left). It looks exactly like a real one, and it lands even during a jam.</div>
          {orderForm('forge', 'Plant forgery')}
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
