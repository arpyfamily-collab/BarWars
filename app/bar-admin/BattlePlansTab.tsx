'use client'

/**
 * Bar Command Center → Battle Plans (Testing To-Do item 19). A bar sets an offer once; it fires
 * on its own when a real war happens (5+ verified members checked in on each side), at most once
 * per night, and shuts off at the cap. Door staff redeem players' codes here.
 */
import { useCallback, useEffect, useState } from 'react'
import DoorQrPanel from './DoorQrPanel'
import StaffSpiesPanel from './StaffSpiesPanel'

const C = { panel: '#111114', border: 'rgba(255,255,255,0.06)', text: '#F5F5F5', dim: '#9CA3AF', gold: '#C9A84C', green: '#22C55E', red: '#E03131' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 14, outline: 'none' }
const btn = (on = true): React.CSSProperties => ({ padding: '10px 14px', background: on ? C.gold : 'rgba(201,168,76,0.3)', color: '#0A0A0C', fontWeight: 700, letterSpacing: '0.1em', border: 'none', borderRadius: 6, cursor: on ? 'pointer' : 'not-allowed', fontSize: 12, textTransform: 'uppercase' })
const small: React.CSSProperties = { padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.dim, fontSize: 12, cursor: 'pointer' }

function Panel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 8, padding: 20 }}>{children}</div>
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>{children}</div>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, margin: '12px 0 6px' }}>{children}</div>
}

export default function BattlePlansTab({ venueId }: { venueId: string }) {
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [code, setCode] = useState('')
  const [offer, setOffer] = useState(''); const [details, setDetails] = useState('')
  const [isDrink, setIsDrink] = useState(false); const [scope, setScope] = useState<'my_bar' | 'any_war'>('my_bar')
  const [cap, setCap] = useState(50); const [nights, setNights] = useState<number[]>([4, 5, 6]); const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/bar-admin/battle-plans?venue_id=${venueId}`, { cache: 'no-store' })
    if (r.ok) setD(await r.json())
  }, [venueId])
  useEffect(() => { load() }, [load])

  async function post(body: any) {
    const r = await fetch('/api/bar-admin/battle-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id: venueId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Something went wrong')
    return j
  }

  async function redeem() {
    setBusy(true); setMsg(null)
    try { const j = await post({ action: 'redeem', code }); setMsg({ kind: 'ok', text: `✓ ${j.offer}. ${j.message}` }); setCode(''); load() }
    catch (e: any) { setMsg({ kind: 'err', text: e.message }) } finally { setBusy(false) }
  }

  async function create() {
    setBusy(true); setMsg(null)
    try {
      await post({ action: 'create', offer_text: offer, details, is_drink: isDrink, scope, cap, nights, days })
      setMsg({ kind: 'ok', text: 'Battle Plan armed. It fires on its own when a real war happens.' }); setOffer(''); setDetails(''); load()
    } catch (e: any) { setMsg({ kind: 'err', text: e.message }) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <DoorQrPanel venueId={venueId} />
      <StaffSpiesPanel venueId={venueId} />
      {d && (
        <Panel accent={d.fired_tonight ? C.green : d.armed_tonight ? C.gold : undefined}>
          <div style={{ fontSize: 14 }}>
            {d.fired_tonight ? '🔥 A Battle Plan fired tonight. Redeem codes below.'
              : d.armed_tonight ? `🛡️ Armed for tonight: ${d.armed_tonight} plan${d.armed_tonight === 1 ? '' : 's'} ready if a war breaks out.`
              : 'No Battle Plan armed for tonight.'}
          </div>
        </Panel>
      )}

      {d && (
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>🚦 BarWars line (optional)</div>
              <div style={{ fontSize: 12, color: C.dim }}>Players in your line already count at half and earn a little Valor while they wait. Switch this on if you run a separate BarWars line; it shows on the war page. Never required.</div>
            </div>
            <button style={{ ...small, ...(d.barwars_line ? { color: C.green, borderColor: C.green } : {}) }}
              onClick={() => post({ action: 'line', on: !d.barwars_line }).then(load)}>{d.barwars_line ? 'On' : 'Off'}</button>
          </div>
        </Panel>
      )}

      <Panel accent={C.gold}>
        <Title>🎟️ Redeem a code</Title>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...input, textTransform: 'uppercase', letterSpacing: '0.2em' }} value={code} maxLength={6} onChange={e => setCode(e.target.value)} placeholder="6-character code" />
          <button style={btn(!busy && code.trim().length === 6)} disabled={busy || code.trim().length !== 6} onClick={redeem}>Redeem</button>
        </div>
      </Panel>

      {msg && <div style={{ fontSize: 13, color: msg.kind === 'ok' ? C.green : C.red }}>{msg.text}</div>}

      <Panel>
        <Title>⚔️ New Battle Plan</Title>
        <div style={{ fontSize: 13, color: C.dim }}>Set it once. When a real war happens (5+ verified members checked in on each side), it fires on its own, once a night, and shuts off at your cap. Fighters who checked in claim a code and show it at the door.</div>
        <Label>Offer</Label>
        <input style={input} value={offer} maxLength={120} onChange={e => setOffer(e.target.value)} placeholder="e.g. $3 wells for the winning side" />
        <Label>Details (optional)</Label>
        <input style={input} value={details} maxLength={300} onChange={e => setDetails(e.target.value)} placeholder="e.g. One per person, until midnight" />
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 10 }}><input type="checkbox" checked={isDrink} onChange={e => setIsDrink(e.target.checked)} /> Drink offer (shown as 21+, staff check ID)</label>
        <Label>Fires when</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['my_bar', 'A war at my bar'], ['any_war', 'Any war on the Square']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setScope(v)} style={{ ...small, ...(scope === v ? { color: C.gold, borderColor: C.gold } : {}) }}>{l}</button>
          ))}
        </div>
        <Label>Nights</Label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS.map((l, i) => (
            <button key={l} onClick={() => setNights(n => n.includes(i) ? n.filter(x => x !== i) : [...n, i])} style={{ ...small, ...(nights.includes(i) ? { color: C.gold, borderColor: C.gold } : {}) }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Label>Cap (first N people)</Label><input style={input} type="number" min={1} max={500} value={cap} onChange={e => setCap(Number(e.target.value))} /></div>
          <div style={{ flex: 1 }}><Label>Expires in (days)</Label><input style={input} type="number" min={1} max={60} value={days} onChange={e => setDays(Number(e.target.value))} /></div>
        </div>
        <button style={{ ...btn(!busy && offer.trim().length >= 3 && nights.length > 0), width: '100%', marginTop: 16, padding: 14 }}
          disabled={busy || offer.trim().length < 3 || !nights.length} onClick={create}>Arm Battle Plan</button>
      </Panel>

      <Panel>
        <Title>Your Battle Plans</Title>
        {!d?.plans?.length ? <div style={{ fontSize: 13, color: C.dim }}>None yet.</div> : d.plans.map((p: any) => {
          const expired = new Date(p.expires_at).getTime() < Date.now()
          return (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{p.offer_text}{p.is_drink ? ' · 21+' : ''}</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                  {p.scope === 'any_war' ? 'Any war on the Square' : 'Wars at my bar'} · {p.nights.map((n: number) => DAYS[n]).join(' ')} · first {p.cap} ·{' '}
                  {expired ? 'expired' : p.paused ? 'paused' : `until ${new Date(p.expires_at).toLocaleDateString()}`}
                </div>
              </div>
              {!expired && <button style={small} onClick={() => post({ action: p.paused ? 'resume' : 'pause', plan_id: p.id }).then(load)}>{p.paused ? 'Resume' : 'Pause'}</button>}
              <button style={small} onClick={() => { if (confirm('Delete this Battle Plan?')) post({ action: 'delete', plan_id: p.id }).then(load) }}>Delete</button>
            </div>
          )
        })}
      </Panel>

      {!!d?.firings?.length && (
        <Panel>
          <Title>Fired</Title>
          {d.firings.map((f: any) => (
            <div key={f.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              {f.night} · {f.plan?.offer_text} · war at {f.war_bar ?? 'a bar'} · <b>{f.claimed_count}/{f.plan?.cap}</b> claimed · <b>{f.redeemed_count}</b> redeemed
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
