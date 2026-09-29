'use client'

/**
 * Public Watch Link for a Turf War (Testing To-Do item 18). Anyone can watch, no app or account:
 * the live Battlefield (side and org only, never names), Crowd Roar, and The Shout (one per
 * spectator per war; signed-out spectators confirm by email first).
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Radio, Megaphone, Flag, Loader2 } from 'lucide-react'

// Email opt-ins hidden for the pilot (Brian, Sep 29): BarWars has no email provider yet, so nothing would be sent.
// Sign-ups already stored are kept. Turn back on once email is set up; push (Build 4) covers war alerts meanwhile.
const EMAIL_OPT_INS = false

const RED = '#E03131', BLUE = '#378ADD'

export default function WatchPage({ params }: { params: { id: string } }) {
  const search = useSearchParams()
  const ref = search.get('ref') ?? undefined
  const [d, setD] = useState<any>(null)
  const [missing, setMissing] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<string | null>(null)
  const [shout, setShout] = useState(''); const [side, setSide] = useState<'' | 'attacker' | 'defender'>('')
  const [marketing, setMarketing] = useState(false); const [alerts, setAlerts] = useState(false)
  const [email, setEmail] = useState(''); const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false); const [linkSent, setLinkSent] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/watch/${params.id}`, { cache: 'no-store' })
    if (res.status === 404) { setMissing(true); return }
    if (res.ok) setD(await res.json())
  }, [params.id])

  useEffect(() => { load(); const t = setInterval(load, 10_000); const c = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(t); clearInterval(c) } }, [load])

  async function post(body: any) {
    const res = await fetch(`/api/watch/${params.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Something went wrong')
    return data
  }

  async function roar(s: 'attacker' | 'defender') {
    try { const r = await post({ action: 'roar', side: s }); setD((x: any) => x && { ...x, roars: r }) } catch (e: any) { setMsg(e.message) }
  }

  async function sendShout() {
    setBusy(true); setMsg(null)
    try { await post({ action: 'shout', content: shout, side: side || undefined, ref, marketing, alerts }); setShout(''); setMsg('Shout posted.'); load() }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  async function sendLink() {
    if (!adult) { setMsg('Confirm you are 18 or older.'); return }
    setBusy(true); setMsg(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.href, data: { age_confirmed_18: true, spectator: true } },
    })
    setBusy(false)
    if (error) setMsg(error.message); else setLinkSent(true)
  }

  if (missing) return <Shell><div style={{ color: 'var(--bw-muted)', textAlign: 'center' }}>This war doesn&apos;t exist.</div></Shell>
  if (!d) return <Shell><Loader2 className="animate-spin" size={22} style={{ color: 'var(--bw-muted)', margin: '40px auto', display: 'block' }} /></Shell>

  const w = d.war
  const live = w.status === 'live' || w.status === 'contested'
  const over = ['successful', 'failed', 'cancelled'].includes(w.status)
  const left = Math.max(0, new Date(w.window_close_at).getTime() - now)
  const hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000), ss = Math.floor((left % 60000) / 1000)
  const roarTotal = (d.roars.attacker ?? 0) + (d.roars.defender ?? 0)

  return (
    <Shell>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: live ? RED : 'var(--bw-muted)', fontWeight: 700 }}>
          {live ? '● Live Turf War' : over ? 'War over' : 'War declared'}
        </div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.04em', lineHeight: 1.1 }}>{w.bar}</div>
        {live && <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: RED }}>{hh > 0 ? `${hh}:` : ''}{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>}
        {!live && !over && <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Starts {new Date(w.window_open_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['attacker', 'defender'] as const).map(s => (
          <div key={s} className="card" style={{ flex: 1, textAlign: 'center', borderTop: `3px solid ${s === 'attacker' ? RED : BLUE}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: s === 'attacker' ? RED : BLUE }}>{s}</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '2px 0' }}>{(s === 'attacker' ? w.attacker : w.defender) ?? 'Open bar'}</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28 }}>{Number(s === 'attacker' ? w.attacker_headcount : w.defender_headcount) || 0}</div>
            <div style={{ fontSize: 10, color: 'var(--bw-muted)' }}>at the bar{s === 'attacker' ? ` · ${w.required_headcount} needed` : ''}</div>
            {over && (s === 'attacker' ? w.attacker_score : w.defender_score) != null && <div style={{ fontSize: 12, marginTop: 4 }}>Score {Number(s === 'attacker' ? w.attacker_score : w.defender_score)}</div>}
            {live && (
              <button className="btn" onClick={() => roar(s)} style={{ marginTop: 8, width: '100%', fontSize: 12, padding: '6px 8px' }}>
                📣 Roar · {d.roars[s] ?? 0}
              </button>
            )}
          </div>
        ))}
      </div>
      {over && w.result && <div className="card" style={{ fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{w.underdog ? '🏆 Underdog win. ' : ''}{w.result}</div>}
      {live && roarTotal > 0 && <div style={{ fontSize: 11, color: 'var(--bw-muted)', textAlign: 'center', marginBottom: 10 }}>{roarTotal} roars from the crowd</div>}

      <Section icon={<Radio size={14} />} title="Battlefield">
        {d.battlefield.length === 0 ? <Empty>Nothing yet. The two sides talk here during the war.</Empty> : d.battlefield.map((m: any) => (
          <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--bw-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: m.side === 'attacker' ? RED : m.side === 'defender' ? BLUE : 'var(--bw-muted)' }}>{m.label}</div>
            <div style={{ fontSize: 13 }}>{m.content}</div>
          </div>
        ))}
      </Section>

      <Section icon={<Megaphone size={14} />} title="The Shout">
        {!over && (
          d.shouted ? <Empty>You used your Shout for this war.</Empty>
          : d.signed_in ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              <textarea className="input" value={shout} maxLength={140} onChange={e => setShout(e.target.value)} placeholder="One Shout per war. Make it count." style={{ minHeight: 60 }} />
              <div style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--bw-muted)' }}>Cheering for</span>
                {(['', 'attacker', 'defender'] as const).map(s => (
                  <button key={s || 'none'} className="btn" onClick={() => setSide(s)} style={{ fontSize: 11, padding: '3px 8px', ...(side === s ? { color: 'var(--bw-gold)', borderColor: 'rgba(245,184,0,0.5)' } : {}) }}>
                    {s === '' ? 'No one' : (s === 'attacker' ? w.attacker : w.defender) ?? s}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', color: 'var(--bw-muted)' }}>{shout.length}/140</span>
              </div>
              {EMAIL_OPT_INS && <>
                <label style={{ fontSize: 12, display: 'flex', gap: 6 }}><input type="checkbox" checked={alerts} onChange={e => setAlerts(e.target.checked)} /> Email me when the next war starts</label>
                <label style={{ fontSize: 12, display: 'flex', gap: 6 }}><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} /> Send me BarWars news and offers (optional)</label>
              </>}
              <button className="btn btn-primary" disabled={busy || !shout.trim()} onClick={sendShout}>{busy ? 'Posting…' : 'Shout'}</button>
            </div>
          ) : linkSent ? (
            <Empty>Check your email for a sign-in link. It brings you back here to Shout.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Confirm your email to Shout. No app needed.</div>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              <label style={{ fontSize: 12, display: 'flex', gap: 6 }}><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} /> I&apos;m 18 or older</label>
              <button className="btn btn-primary" disabled={busy || !email.includes('@')} onClick={sendLink}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            </div>
          )
        )}
        {d.shouts.length === 0 ? <Empty>No Shouts yet.</Empty> : d.shouts.map((s: any) => (
          <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--bw-border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: s.side === 'attacker' ? RED : s.side === 'defender' ? BLUE : 'var(--bw-muted)', fontWeight: 700 }}>
                Spectator{s.side ? ` · for ${(s.side === 'attacker' ? w.attacker : w.defender) ?? s.side}` : ''}
              </div>
              <div style={{ fontSize: 13 }}>{s.content}</div>
            </div>
            <button title="Report" aria-label="Report this Shout" onClick={async () => { try { await post({ action: 'report', shout_id: s.id }); setMsg('Reported. Thanks.'); load() } catch (e: any) { setMsg(e.message) } }}
              style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', cursor: 'pointer', padding: 4 }}><Flag size={12} /></button>
          </div>
        ))}
      </Section>

      {msg && <div style={{ fontSize: 12, color: 'var(--bw-gold)', textAlign: 'center', margin: '8px 0' }}>{msg}</div>}
      <div style={{ fontSize: 11, color: 'var(--bw-muted)', textAlign: 'center', marginTop: 16 }}>
        BarWars · Oxford&apos;s nightlife turf war · <a href="https://barwars.app" style={{ color: 'var(--bw-muted)' }}>barwars.app</a>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="page" style={{ minHeight: '100dvh' }}><div className="page-content" style={{ maxWidth: 520, margin: '0 auto', paddingTop: 24 }}>{children}</div></div>
}
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}>{icon}{title}</div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--bw-muted)', padding: '6px 0' }}>{children}</div>
}
