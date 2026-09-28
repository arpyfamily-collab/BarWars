'use client'

/**
 * "Your Factions": every faction the player is in, with Leave / Step down / Deregister / Quit,
 * a confirmation that spells out what leaving costs, the captain step-down pop-up (Brian, Sep 28),
 * the unit's step-down banner, and an "i" sheet with all the faction rules (To-Do items 9 and 10).
 */

import { useCallback, useEffect, useState } from 'react'
import { Info, X, Crown, LogOut, AlertTriangle, Clock, UserPlus, Check } from 'lucide-react'

type FactionType = 'greek' | 'company' | 'regiment' | 'mercenary' | 'spy'

interface Faction {
  type: FactionType
  id: string | null
  name: string
  role: 'member' | 'admin' | 'captain' | 'pending'
  joined_at: string
  leave: { grace: boolean; live_war: boolean; cooldown_days: number; grace_ends_at?: string }
  stepdown?: { ends_at: string; captain_name: string | null; nominee_id: string | null; nominee_name: string | null; i_am_nominee: boolean }
  members?: { id: string; name: string }[]
  requests?: { member_id: string; name: string }[]
}

const SUPPORT = "Signed up for the wrong group? Contact support@barwars.app and we'll move you."

const LABEL: Record<FactionType, string> = {
  greek: 'Greek org', company: 'Hessian company', regiment: 'Regiment', mercenary: 'Mercenary', spy: 'Spy',
}
const UNIT: Record<string, string> = { company: 'company', regiment: 'Regiment' }

function fmt(ts?: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function cooldownText(f: Faction): string {
  switch (f.type) {
    case 'greek': return 'You’ll wait 7 days before you can join a Hessian company or a Regiment.'
    case 'company': return 'You’ll wait 7 days before you can join another company, a Regiment or a Greek org.'
    case 'regiment': return 'You’ll wait 3 days before you can join another faction.'
    case 'mercenary': return 'You’ll wait 7 days before you can register as a mercenary again.'
    case 'spy': return 'No handler can recruit you again for 14 days.'
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#13171F', border: '1px solid #252D3D', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520,
        maxHeight: '85vh', overflowY: 'auto', padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.04em' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: 'var(--bw-text)' }}>
      {items.map((t, i) => <li key={i} style={{ marginBottom: 6 }}>{t}</li>)}
    </ul>
  )
}

export function FactionRulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Faction rules" onClose={onClose}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', margin: '4px 0 6px' }}>Who can be what</div>
      <Bullets items={[
        'Greek members can’t be Hessians or solo mercenaries. Becoming a mole is how a Greek member betrays their org.',
        'Hessians can also be solo mercenaries and spies.',
        'You’re in at most one Greek org, one Hessian company and one Regiment.',
      ]} />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', margin: '4px 0 6px' }}>Leaving</div>
      <Bullets items={[
        'Nobody leaves while their faction is in a live Turf War. Wars are short; wait it out.',
        'Changed your mind? For 72 hours after joining, you can leave with no cooldown, as long as your faction hasn’t fought, taken a contract or declared an ambush with you in it.',
        'After that, leaving starts a cooldown: Greek org 7 days, Hessian company 7 days, Regiment 3 days, mercenary 7 days before registering again, spy 14 days before anyone can recruit you again.',
        'Leaving in the middle of a contract costs you your share of it.',
      ]} />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', margin: '4px 0 6px' }}>Captains</div>
      <Bullets items={[
        'Captains don’t just leave; they step down with 3 days’ notice. No unit is left without a leader.',
        'During the notice you stay captain but can’t take new contracts or start ambushes.',
        'You can nominate the next captain. If they accept, the handover happens right away. If no one does, the longest-serving member takes over when the notice ends. If you’re the only member, the unit disbands.',
        'After stepping down, you can’t start a new Hessian company or Regiment for 30 days, and your old unit’s members can’t follow you into another faction for 30 days.',
        'If a captain deletes their account, the longest-serving member becomes captain.',
      ]} />
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>{SUPPORT}</div>
    </Modal>
  )
}

export default function YourFactions({ types, title = 'Your factions' }: { types?: FactionType[]; title?: string }) {
  const [factions, setFactions] = useState<Faction[]>([])
  const [cooldowns, setCooldowns] = useState<{ type: string; until: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [rules, setRules] = useState(false)
  const [leaving, setLeaving] = useState<Faction | null>(null)
  const [steppingDown, setSteppingDown] = useState<Faction | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [nominee, setNominee] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/factions/me', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) { setFactions(data.factions ?? []); setCooldowns(data.cooldowns ?? []) }
    } finally { setLoaded(true) }
  }, [])
  useEffect(() => { load() }, [load])

  async function call(url: string, body: any, okText: (d: any) => string) {
    setBusy(true); setMessage(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) setMessage({ kind: 'error', text: data.error || 'Something went wrong' })
      else { setMessage({ kind: 'ok', text: okText(data) }); await load() }
    } catch { setMessage({ kind: 'error', text: 'Network error. Try again.' }) }
    finally { setBusy(false); setLeaving(null); setSteppingDown(null) }
  }

  // Hessian invites (To-Do item 2): the phone's share sheet sends the link by text, email, WhatsApp...
  async function invite(f: Faction) {
    setBusy(true); setMessage(null)
    try {
      const res = await fetch('/api/turf-wars/hessians/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: f.id }) })
      const d = await res.json()
      if (!res.ok) { setMessage({ kind: 'error', text: d.error || 'Could not make an invite' }); return }
      const text = `Join my Hessian company ${d.company_name} on BarWars. Tap to join:`
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try { await (navigator as any).share({ title: `Join ${d.company_name}`, text, url: d.url }) }
        catch (e: any) { if (e?.name !== 'AbortError') throw e }
      } else {
        await navigator.clipboard.writeText(`${text} ${d.url}`)
        setMessage({ kind: 'ok', text: 'Invite link copied. Paste it into a text or email.' })
      }
    } catch { setMessage({ kind: 'error', text: 'Could not share the invite. Try again.' }) }
    finally { setBusy(false) }
  }

  async function decide(memberId: string, name: string, action: 'approve' | 'reject') {
    setBusy(true); setMessage(null)
    try {
      const res = await fetch('/api/turf-wars/hessians/join', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: memberId, action }) })
      const d = await res.json()
      if (!res.ok) setMessage({ kind: 'error', text: d.error || 'Something went wrong' })
      else { setMessage({ kind: 'ok', text: action === 'approve' ? `${name} is in.` : `Declined ${name}.` }); await load() }
    } catch { setMessage({ kind: 'error', text: 'Network error. Try again.' }) }
    finally { setBusy(false) }
  }

  const shown = factions.filter(f => !types || types.includes(f.type))
  const shownCooldowns = cooldowns.filter(c => !types || types.includes(c.type as FactionType) || c.type === 'ex_captain')
  if (!loaded || (shown.length === 0 && shownCooldowns.length === 0 && !message)) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>{title}</div>
        <button onClick={() => setRules(true)} aria-label="Faction rules" style={{ background: 'none', border: 'none', color: 'var(--bw-cyan)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <Info size={16} /> Rules
        </button>
      </div>

      {message && (
        <div style={{ fontSize: 13, marginBottom: 10, color: message.kind === 'ok' ? 'var(--bw-green)' : 'var(--bw-red)', lineHeight: 1.45 }}>{message.text}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map(f => {
          const key = `${f.type}:${f.id}`
          const isCaptain = f.role === 'captain'
          return (
            <div key={key} style={{ border: '1px solid var(--bw-border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bw-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isCaptain && <Crown size={14} style={{ color: 'var(--bw-gold)' }} />}{f.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                    {LABEL[f.type]} · {f.role === 'pending' ? 'request pending' : f.role}
                  </div>
                </div>
                {f.role === 'pending' ? (
                  <button className="btn" disabled={busy} style={{ fontSize: 12, padding: '6px 10px' }}
                    onClick={() => call('/api/factions/leave', { type: f.type, id: f.id }, () => 'Request cancelled.')}>Cancel request</button>
                ) : isCaptain ? (
                  !f.stepdown && <button className="btn" disabled={busy || f.leave.live_war} style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setSteppingDown(f)}>Step down</button>
                ) : (
                  <button className="btn" disabled={busy || f.leave.live_war} style={{ fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setLeaving(f)}>
                    <LogOut size={13} /> {f.type === 'mercenary' ? 'Deregister' : f.type === 'spy' ? 'Quit' : 'Leave'}
                  </button>
                )}
              </div>

              {f.leave.live_war && f.role !== 'pending' && (
                <div style={{ fontSize: 12, color: 'var(--bw-flare)', marginTop: 8 }}>In a live Turf War. You can leave once it’s over.</div>
              )}

              {f.stepdown && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(245,184,0,0.08)', border: '1px solid rgba(245,184,0,0.3)', fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, color: 'var(--bw-flare)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} /> {isCaptain ? 'You’re stepping down' : `${f.stepdown.captain_name ?? 'Your captain'} is stepping down`}
                  </div>
                  <div style={{ color: 'var(--bw-text)' }}>
                    Handover by {fmt(f.stepdown.ends_at)}. {f.stepdown.nominee_name
                      ? `${f.stepdown.nominee_name} is nominated to take over.`
                      : 'If no one is nominated and accepts, the longest-serving member takes over.'}
                  </div>
                  {f.stepdown.i_am_nominee && (
                    <button className="btn btn-primary" disabled={busy} style={{ marginTop: 8, fontSize: 12, padding: '6px 12px' }}
                      onClick={() => call('/api/factions/captain', { type: f.type, id: f.id, action: 'accept' }, () => 'You’re the captain now.')}>
                      Accept captaincy
                    </button>
                  )}
                  {isCaptain && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <select className="input" value={nominee[key] ?? ''} onChange={e => setNominee({ ...nominee, [key]: e.target.value })} style={{ flex: 1, minWidth: 140, fontSize: 12 }}>
                        <option value="">Nominate the next captain…</option>
                        {(f.members ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <button className="btn" disabled={busy || !nominee[key]} style={{ fontSize: 12, padding: '6px 10px' }}
                        onClick={() => call('/api/factions/captain', { type: f.type, id: f.id, action: 'nominate', nominee_id: nominee[key] }, () => 'Nominated. They can accept any time before the handover.')}>Nominate</button>
                      <button className="btn" disabled={busy} style={{ fontSize: 12, padding: '6px 10px' }}
                        onClick={() => call('/api/factions/captain', { type: f.type, id: f.id, action: 'cancel' }, () => 'Step-down cancelled. You’re staying on as captain.')}>Cancel step-down</button>
                    </div>
                  )}
                </div>
              )}

              {isCaptain && f.type === 'company' && (
                <button className="btn" disabled={busy} onClick={() => invite(f)}
                  style={{ marginTop: 10, width: '100%', fontSize: 13, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: 'rgba(245,184,0,0.35)', color: 'var(--bw-gold)' }}>
                  <UserPlus size={15} /> Invite friends by text or email
                </button>
              )}

              {isCaptain && (f.requests ?? []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bw-gold)', marginBottom: 6 }}>Join requests ({f.requests!.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {f.requests!.map(r => (
                      <div key={r.member_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button className="btn" disabled={busy} style={{ fontSize: 11, padding: '4px 9px', color: 'var(--bw-green)', borderColor: 'rgba(46,204,113,0.35)', display: 'flex', alignItems: 'center', gap: 3 }}
                            onClick={() => decide(r.member_id, r.name, 'approve')}><Check size={12} /> Approve</button>
                          <button className="btn" disabled={busy} style={{ fontSize: 11, padding: '4px 9px' }}
                            onClick={() => decide(r.member_id, r.name, 'reject')}>Decline</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isCaptain && !f.stepdown && (f.members ?? []).length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer' }}>Members ({f.members!.length})</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {f.members!.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>{m.name}</span>
                        <button className="btn" disabled={busy} style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => { if (confirm(`Remove ${m.name} from ${f.name}? They won't get a cooldown.`)) call('/api/factions/captain', { type: f.type, id: f.id, action: 'remove', member_id: m.id }, () => `${m.name} removed.`) }}>Remove</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )
        })}
      </div>

      {shownCooldowns.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
          {shownCooldowns.map(c => (
            <div key={c.type}>
              {c.type === 'ex_captain'
                ? `Former captain: you can start a new company or Regiment after ${fmt(c.until)}.`
                : `Cooldown after leaving a ${LABEL[c.type as FactionType] ?? c.type}: ends ${fmt(c.until)}.`}
            </div>
          ))}
          <div style={{ marginTop: 4 }}>{SUPPORT}</div>
        </div>
      )}

      {rules && <FactionRulesSheet onClose={() => setRules(false)} />}

      {leaving && (
        <Modal title={leaving.type === 'mercenary' ? 'Deregister as a mercenary?' : leaving.type === 'spy' ? 'Quit as a spy?' : `Leave ${leaving.name}?`} onClose={() => setLeaving(null)}>
          <Bullets items={[
            leaving.leave.grace
              ? `You joined less than 72 hours ago and haven’t fought with them yet, so there’s no cooldown.`
              : cooldownText(leaving),
            ...(leaving.type === 'mercenary' ? ['Any contract you haven’t finished is forfeited, and you lose your share of it.'] : []),
            ...(leaving.type === 'company' ? ['If your company is under contract, you lose your share of it.'] : []),
            ...(leaving.type === 'greek' && leaving.role === 'admin' ? ['If you’re the last admin, make someone else an admin first.'] : []),
            ...(leaving.type === 'spy' ? ['Your handler stops receiving your intel.'] : []),
          ]} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setLeaving(null)}>Stay</button>
            <button className="btn btn-primary" style={{ flex: 1, background: 'var(--bw-red)' }} disabled={busy}
              onClick={() => call('/api/factions/leave', { type: leaving.type, id: leaving.id }, d =>
                d?.cooldown_until ? `Done. Your cooldown ends ${fmt(d.cooldown_until)}.` : 'Done. No cooldown.')}>
              {leaving.type === 'mercenary' ? 'Deregister' : leaving.type === 'spy' ? 'Quit' : 'Leave'}
            </button>
          </div>
        </Modal>
      )}

      {steppingDown && (
        <Modal title="Step down as captain?" onClose={() => setSteppingDown(null)}>
          {steppingDown.leave.grace ? (
            <Bullets items={[
              `Your ${UNIT[steppingDown.type]} is under 72 hours old and hasn’t fought yet, so you can step down right now with no penalties.`,
              'The longest-serving member becomes captain. If you’re the only member, it disbands.',
            ]} />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--bw-flare)', marginBottom: 10 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> Here’s what happens, so there are no surprises.
              </div>
              <Bullets items={[
                'A 3-day notice starts now. You stay captain until the handover, but you can’t take new contracts or start ambushes.',
                'Nominate the member you want to take over. If they accept, the handover happens right away.',
                'If no one accepts by the end of the notice, the longest-serving member becomes captain. If you’re the only member, the unit disbands.',
                `After you leave: ${steppingDown.type === 'company' ? '7' : '3'} days before you can join another faction, and 30 days before you can start a new Hessian company or Regiment.`,
                'For 30 days, members of this unit can’t follow you into another faction.',
                'You can cancel any time during the notice.',
              ]} />
            </>
          )}
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>{SUPPORT}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setSteppingDown(null)}>Stay captain</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}
              onClick={() => call('/api/factions/captain', { type: steppingDown.type, id: steppingDown.id, action: 'step_down' }, d =>
                d?.status === 'notice' ? `Notice started. Handover by ${fmt(d.ends_at)}. Nominate your successor below.`
                : d?.status === 'disbanded' ? 'You were the only member, so the unit has disbanded.'
                : 'Done. The longest-serving member is now captain.')}>
              {steppingDown.leave.grace ? 'Step down now' : 'Start 3-day notice'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
