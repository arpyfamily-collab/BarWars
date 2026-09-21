'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Skull, Crosshair, Eye, Flame, AlertCircle, Check, X, Send, Trophy, Coins, Shield, Zap, User } from 'lucide-react'

type Tab = 'exchange' | 'sniper' | 'scorched'

interface MercProfile {
  id: string
  is_active: boolean
  is_anonymous: boolean
  contracts_completed: number
  contracts_failed: number
  war_bonds: number
  sniper_eligible: boolean
  is_sniper: boolean
}

interface MercListing {
  id: string
  display_name: string
  contracts_completed: number
  execution_rate: number
  is_sniper: boolean
  sniper_eligible: boolean
}

interface MercContract {
  id: string
  role: string
  status: string
  war_bond_reward: number
  created_at: string
  resolved_at: string | null
  org: { name: string } | null
  company: { name: string } | null
}

interface BondEntry {
  id: string
  amount: number
  reason: string
  created_at: string
}

interface SniperContract {
  id: string
  status: string
  tactics_used: string | null
  created_at: string
  org: { name: string } | null
  company: { name: string } | null
}

interface ScorchedEvent {
  id: string
  codename: string
  event_date: string
  side: string
  status: string
  war_bond_reward: number
  created_at: string
  bar: { name: string } | null
  org: { name: string } | null
  company: { name: string } | null
}

const ROLE_LABELS: Record<string, string> = {
  headcount_filler: 'Headcount Filler',
  intel_extraction: 'Intel Extraction',
  disinformation: 'Disinformation',
  distraction: 'Distraction (Decoy)',
}

const ROLE_REWARDS: Record<string, number> = {
  headcount_filler: 5,
  intel_extraction: 10,
  disinformation: 5,
  distraction: 15,
}

export default function MercenariesPage() {
  const [tab, setTab] = useState<Tab>('exchange')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Mercenary state
  const [profile, setProfile] = useState<MercProfile | null>(null)
  const [listings, setListings] = useState<MercListing[]>([])
  const [contracts, setContracts] = useState<MercContract[]>([])
  const [bonds, setBonds] = useState<BondEntry[]>([])

  // Sniper state
  const [sniperContracts, setSniperContracts] = useState<{ asSniper: SniperContract[]; asTarget: SniperContract[]; isSniper: boolean }>({ asSniper: [], asTarget: [], isSniper: false })

  // Scorched earth state
  const [scorchedEvents, setScorchedEvents] = useState<ScorchedEvent[]>([])
  const [myScorched, setMyScorched] = useState<ScorchedEvent[]>([])

  // Forms
  const [hireMercId, setHireMercId] = useState('')
  const [hireRole, setHireRole] = useState('headcount_filler')
  const [hireDecoyBar, setHireDecoyBar] = useState('')
  const [sniperTargetId, setSniperTargetId] = useState('')
  const [sniperHireId, setSniperHireId] = useState('')
  const [scorchedBarId, setScorchedBarId] = useState('')
  const [scorchedDate, setScorchedDate] = useState('')
  const [scorchedSide, setScorchedSide] = useState('self')

  async function loadAll() {
    try {
      const [mineRes, exchRes, sniperRes, scorchedRes, myScorchedRes] = await Promise.all([
        fetch('/api/turf-wars/mercenaries?mine=true'),
        fetch('/api/turf-wars/mercenaries'),
        fetch('/api/turf-wars/mercenaries/sniper'),
        fetch('/api/turf-wars/mercenaries/scorched-earth'),
        fetch('/api/turf-wars/mercenaries/scorched-earth?mine=true'),
      ])
      const mineData = await mineRes.json()
      const exchData = await exchRes.json()
      const sniperData = await sniperRes.json()
      const scorchedData = await scorchedRes.json()
      const myScorchedData = await myScorchedRes.json()

      if (mineData && !mineData.error) {
        setProfile(mineData.profile ?? null)
        setContracts(mineData.contracts ?? [])
        setBonds(mineData.bonds ?? [])
      }
      if (Array.isArray(exchData)) setListings(exchData)
      if (sniperData && !sniperData.error) setSniperContracts(sniperData)
      if (Array.isArray(scorchedData)) setScorchedEvents(scorchedData)
      if (Array.isArray(myScorchedData)) setMyScorched(myScorchedData)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  async function register() {
    setActionLoading('register')
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', is_anonymous: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function toggleSniperEligible() {
    setActionLoading('toggle')
    try {
      const res = await fetch('/api/turf-wars/mercenaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_sniper_eligible' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function respondContract(id: string, response: 'accept' | 'reject') {
    setActionLoading(id)
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', contract_id: id, response }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(response === 'accept' ? 'Contract accepted.' : 'Contract rejected.')
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function completeContract(id: string, success: boolean) {
    setActionLoading(`complete_${id}`)
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', contract_id: id, success }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(success ? `Contract completed. +${data.war_bonds_earned} War Bonds.` : 'Contract marked as failed.')
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function hireMerc() {
    if (!hireMercId) { setResult('Select a mercenary to hire'); return }
    setActionLoading('hire')
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mercenary_id: hireMercId,
          role: hireRole,
          distraction_decoy_bar_id: hireRole === 'distraction' ? hireDecoyBar : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setHireMercId('')
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function hireSniper() {
    if (!sniperHireId || !sniperTargetId) { setResult('Select sniper and target'); return }
    setActionLoading('hire_sniper')
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries/sniper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sniper_id: sniperHireId, target_user_id: sniperTargetId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setSniperHireId('')
      setSniperTargetId('')
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function sniperAction(contractId: string, action: 'activate' | 'succeed' | 'fail') {
    setActionLoading(`sniper_${contractId}`)
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries/sniper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(action === 'succeed' ? `Sniper success. +${data.war_bonds_earned} War Bonds.` : `Sniper contract ${action}d.`)
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function declareScorched() {
    if (!scorchedBarId || !scorchedDate) { setResult('Bar and date required'); return }
    setActionLoading('scorched')
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries/scorched-earth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_bar_id: scorchedBarId, event_date: scorchedDate, side: scorchedSide }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setScorchedBarId('')
      setScorchedDate('')
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  async function resolveScorched(eventId: string, result: 'victorious' | 'defeated') {
    setActionLoading(`resolve_${eventId}`)
    setResult(null)
    try {
      const res = await fetch('/api/turf-wars/mercenaries/scorched-earth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, result }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(`${data.badge}. +${data.war_bonds_earned} War Bonds.`)
      loadAll()
    } catch (e: any) { setResult(e.message) }
    finally { setActionLoading(null) }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skull size={26} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.04em' }}>The Exchange</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Mercenaries. Snipers. Scorched Earth. No loyalty. No mercy.
        </div>
      </div>

      <div className="page-content">
        {result && (
          <div className="card" style={{
            borderColor: result.includes('error') || result.includes('Error') ? 'rgba(224,49,49,0.3)' : 'rgba(245,184,0,0.3)',
            background: result.includes('error') || result.includes('Error') ? 'rgba(224,49,49,0.08)' : 'rgba(245,184,0,0.08)',
          }}>
            <div style={{ fontSize: 13, color: result.includes('error') || result.includes('Error') ? 'var(--bw-red)' : 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{result}
            </div>
          </div>
        )}

        {/* War Bonds balance */}
        {profile && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Coins size={18} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>War Bonds</span>
            </div>
            <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--bw-gold)' }}>{profile.war_bonds}</span>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <TabBtn active={tab === 'exchange'} onClick={() => setTab('exchange')} icon={<Skull size={13} />} label="Exchange" />
          <TabBtn active={tab === 'sniper'} onClick={() => setTab('sniper')} icon={<Crosshair size={13} />} label="Sniper" />
          <TabBtn active={tab === 'scorched'} onClick={() => setTab('scorched')} icon={<Flame size={13} />} label="Scorched Earth" />
        </div>

        {/* EXCHANGE TAB */}
        {tab === 'exchange' && (
          <>
            {/* Registration or profile */}
            {!profile ? (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Skull size={16} style={{ color: 'var(--bw-gold)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Become a Mercenary</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5, marginBottom: 12 }}>
                  Solo. Anonymous. No loyalty. No company. No reputation beyond your execution rate. You&apos;re listed in the Exchange with only your stats. Take contracts for War Bonds.
                </div>
                <button className="btn btn-primary" onClick={register} disabled={actionLoading === 'register'}>
                  <Skull size={16} /> {actionLoading === 'register' ? 'Registering…' : 'Register as Mercenary'}
                </button>
              </div>
            ) : (
              <>
                {/* Profile */}
                <div className="card" style={{ background: 'var(--bw-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>Your Profile</span>
                    <span style={{ fontSize: 11, color: profile.is_anonymous ? 'var(--bw-muted)' : 'var(--bw-text)' }}>
                      {profile.is_anonymous ? 'Anonymous' : 'Public'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--bw-muted)' }}>
                    <span><b style={{ color: 'var(--bw-green)' }}>{profile.contracts_completed}</b> completed</span>
                    <span><b style={{ color: 'var(--bw-red)' }}>{profile.contracts_failed}</b> failed</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, borderColor: profile.sniper_eligible ? 'rgba(224,49,49,0.3)' : 'var(--bw-border)', color: profile.sniper_eligible ? 'var(--bw-red)' : 'var(--bw-muted)' }}
                      onClick={toggleSniperEligible} disabled={actionLoading === 'toggle'}>
                      <Crosshair size={12} /> {profile.sniper_eligible ? 'Sniper Eligible: ON' : 'Enable Sniper Eligible'}
                    </button>
                  </div>
                  {profile.sniper_eligible && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--bw-red)' }}>
                      You are Sniper Eligible. You can be targeted. Come at me.
                    </div>
                  )}
                </div>

                {/* Pending contracts */}
                {contracts.filter(c => c.status === 'pending').length > 0 && (
                  <div className="card">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-gold)', marginBottom: 10 }}>
                      Pending Contracts
                    </div>
                    <div className="stack stack-sm">
                      {contracts.filter(c => c.status === 'pending').map(c => (
                        <div key={c.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{ROLE_LABELS[c.role]}</span>
                            <span style={{ fontSize: 11, color: 'var(--bw-gold)' }}>{c.war_bond_reward} bonds</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 8 }}>
                            From: {c.org?.name ?? c.company?.name ?? 'Unknown'}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)' }}
                              onClick={() => respondContract(c.id, 'accept')} disabled={actionLoading === c.id}>
                              <Check size={12} /> Accept
                            </button>
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                              onClick={() => respondContract(c.id, 'reject')} disabled={actionLoading === c.id}>
                              <X size={12} /> Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active contracts */}
                {contracts.filter(c => c.status === 'accepted').length > 0 && (
                  <div className="card">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
                      Active Contracts
                    </div>
                    <div className="stack stack-sm">
                      {contracts.filter(c => c.status === 'accepted').map(c => (
                        <div key={c.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{ROLE_LABELS[c.role]}</span>
                            <span style={{ fontSize: 11, color: 'var(--bw-gold)' }}>{c.war_bond_reward} bonds</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 8 }}>
                            From: {c.org?.name ?? c.company?.name ?? 'Unknown'}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)' }}
                              onClick={() => completeContract(c.id, true)} disabled={actionLoading === `complete_${c.id}`}>
                              <Trophy size={12} /> Mark Complete
                            </button>
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                              onClick={() => completeContract(c.id, false)} disabled={actionLoading === `complete_${c.id}`}>
                              <X size={12} /> Mark Failed
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Exchange listings — hire a mercenary */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                Mercenary Exchange
              </div>
              <div className="stack stack-sm">
                {listings.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                    No mercenaries active right now.
                  </div>
                ) : listings.map(m => (
                  <div key={m.id} className="card" style={{ borderLeft: m.is_sniper ? '3px solid #E03131' : 'var(--bw-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, letterSpacing: '0.04em' }}>{m.display_name}</span>
                      <span style={{ fontSize: 11, color: m.execution_rate === 100 ? 'var(--bw-green)' : 'var(--bw-muted)' }}>
                        {m.execution_rate}% execution
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--bw-muted)', marginBottom: 8 }}>
                      <span>{m.contracts_completed} contracts</span>
                      {m.is_sniper && <span style={{ color: '#E03131' }}>Sniper</span>}
                      {m.sniper_eligible && <span style={{ color: 'var(--bw-red)' }}>Eligible target</span>}
                    </div>
                    <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, borderColor: 'rgba(245,184,0,0.2)', color: 'var(--bw-gold)' }}
                      onClick={() => { setHireMercId(m.id); setResult(null) }}>
                      Hire This Mercenary
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Hire form */}
            {hireMercId && (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Contract Details
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Role</label>
                  <select className="input" value={hireRole} onChange={e => setHireRole(e.target.value)} style={{ marginTop: 6 }}>
                    <option value="headcount_filler">Headcount Filler (5 bonds)</option>
                    <option value="intel_extraction">Intel Extraction (10 bonds)</option>
                    <option value="disinformation">Disinformation (5 bonds)</option>
                    <option value="distraction">Distraction / Decoy (15 bonds)</option>
                  </select>
                </div>
                {hireRole === 'distraction' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Decoy Bar ID</label>
                    <input className="input" value={hireDecoyBar} onChange={e => setHireDecoyBar(e.target.value)} placeholder="Bar ID to use as decoy" style={{ marginTop: 6 }} />
                  </div>
                )}
                <button className="btn btn-primary" onClick={hireMerc} disabled={actionLoading === 'hire'}>
                  <Send size={16} /> {actionLoading === 'hire' ? 'Sending…' : 'Offer Contract'}
                </button>
              </div>
            )}
          </>
        )}

        {/* SNIPER TAB */}
        {tab === 'sniper' && (
          <>
            <div className="card" style={{ background: 'var(--bw-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Crosshair size={16} style={{ color: '#E03131' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>The Sniper</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
                A Sniper shadows a specific consenting target during an event, keeping them from reaching their bar before the window closes. Targets must opt in — Sniper Eligible is a status symbol. You can only snipe players who want to be hunted.
              </div>
            </div>

            {/* Sniper contracts as sniper */}
            {sniperContracts.asSniper.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E03131', marginBottom: 10 }}>
                  Your Sniper Contracts
                </div>
                <div className="stack stack-sm">
                  {sniperContracts.asSniper.map(c => (
                    <div key={c.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Hired by: {c.org?.name ?? c.company?.name ?? 'Unknown'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: c.status === 'successful' ? 'var(--bw-green)' : c.status === 'active' ? '#E03131' : 'var(--bw-muted)' }}>{c.status}</span>
                      </div>
                      {c.status === 'pending' && (
                        <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, borderColor: 'rgba(224,49,49,0.3)', color: '#E03131' }}
                          onClick={() => sniperAction(c.id, 'activate')} disabled={actionLoading === `sniper_${c.id}`}>
                          <Zap size={12} /> Activate
                        </button>
                      )}
                      {c.status === 'active' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)' }}
                            onClick={() => sniperAction(c.id, 'succeed')} disabled={actionLoading === `sniper_${c.id}`}>
                            <Trophy size={12} /> Mission Success
                          </button>
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                            onClick={() => sniperAction(c.id, 'fail')} disabled={actionLoading === `sniper_${c.id}`}>
                            <X size={12} /> Mission Failed
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sniper contracts as target */}
            {sniperContracts.asTarget.length > 0 && (
              <div className="card" style={{ borderLeft: '3px solid #E03131' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Eye size={16} style={{ color: '#E03131' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>You&apos;re Being Hunted ({sniperContracts.asTarget.length})</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
                  Someone has contracted a sniper to keep you from your target. Stay sharp. Trust nothing. Verify everything.
                </div>
                {sniperContracts.asTarget.filter(c => c.status === 'active' || c.status === 'pending').map(c => (
                  <div key={c.id} style={{ marginTop: 8, fontSize: 11, color: '#E03131' }}>
                    Active hunt from: {c.org?.name ?? c.company?.name ?? 'Unknown party'}
                  </div>
                ))}
              </div>
            )}

            {/* Hire a sniper */}
            <div className="card">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                Hire a Sniper
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Sniper ID (from Exchange)</label>
                <input className="input" value={sniperHireId} onChange={e => setSniperHireId(e.target.value)} placeholder="Mercenary ID" style={{ marginTop: 6 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Target User ID (must be Sniper Eligible)</label>
                <input className="input" value={sniperTargetId} onChange={e => setSniperTargetId(e.target.value)} placeholder="User ID of consenting target" style={{ marginTop: 6 }} />
              </div>
              <button className="btn btn-primary" onClick={hireSniper} disabled={actionLoading === 'hire_sniper'} style={{ borderColor: 'rgba(224,49,49,0.4)' }}>
                <Crosshair size={16} /> {actionLoading === 'hire_sniper' ? 'Contracting…' : 'Issue Sniper Contract'}
              </button>
            </div>
          </>
        )}

        {/* SCORCHED EARTH TAB */}
        {tab === 'scorched' && (
          <>
            <div className="card" style={{ background: 'var(--bw-surface)', borderLeft: '3px solid #E03131' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Flame size={16} style={{ color: '#E03131' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Scorched Earth</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
                Graduating seniors go out with a bang. Declare a Scorched Earth event at a specific bar on a specific night. One-time. One night. No faction restrictions. Any org, any Hessian Company, any student can participate. Win or lose, it&apos;s permanent on your profile.
              </div>
            </div>

            {/* Active scorched earth events */}
            {scorchedEvents.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E03131', marginBottom: 12 }}>
                  Active Scorched Earth Declarations
                </div>
                <div className="stack stack-sm">
                  {scorchedEvents.map(ev => (
                    <div key={ev.id} className="card" style={{ borderLeft: '3px solid #E03131', animation: 'pulse 3s infinite' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Flame size={16} style={{ color: '#E03131' }} />
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>{ev.codename}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ev.status === 'live' ? '#E03131' : 'var(--bw-gold)', marginLeft: 'auto' }}>
                          {ev.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 4 }}>
                        Going out in flames at <b>{ev.bar?.name ?? 'a bar'}</b>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                        {new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Your scorched earth events */}
            {myScorched.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
                  Your Scorched Earth History
                </div>
                <div className="stack stack-sm">
                  {myScorched.map(ev => (
                    <div key={ev.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16 }}>{ev.codename}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          color: ev.status === 'victorious' ? 'var(--bw-gold)' : ev.status === 'defeated' ? 'var(--bw-muted)' : '#E03131' }}>
                          {ev.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                        {ev.bar?.name} · {new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      {(ev.status === 'announced' || ev.status === 'live') && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, borderColor: 'rgba(245,184,0,0.3)', color: 'var(--bw-gold)' }}
                            onClick={() => resolveScorched(ev.id, 'victorious')} disabled={actionLoading === `resolve_${ev.id}`}>
                            <Trophy size={12} /> Victorious
                          </button>
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                            onClick={() => resolveScorched(ev.id, 'defeated')} disabled={actionLoading === `resolve_${ev.id}`}>
                            <X size={12} /> Went Down Swinging
                          </button>
                        </div>
                      )}
                      {ev.status === 'victorious' && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Trophy size={11} /> Scorched Earth Champion — Class of {new Date(ev.event_date).getFullYear()}
                        </div>
                      )}
                      {ev.status === 'defeated' && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--bw-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Flame size={11} /> Went down swinging — Class of {new Date(ev.event_date).getFullYear()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declare scorched earth — only if user hasn't already */}
            {myScorched.length === 0 && (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Declare Scorched Earth
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Target Bar</label>
                  <input className="input" value={scorchedBarId} onChange={e => setScorchedBarId(e.target.value)} placeholder="Bar ID" style={{ marginTop: 6 }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Event Date (within 30 days)</label>
                  <input className="input" type="date" value={scorchedDate} onChange={e => setScorchedDate(e.target.value)} style={{ marginTop: 6 }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Fight For</label>
                  <select className="input" value={scorchedSide} onChange={e => setScorchedSide(e.target.value)} style={{ marginTop: 6 }}>
                    <option value="self">Myself — I claim this bar in my name</option>
                    <option value="attacker">An attacking org</option>
                    <option value="defender">A defending org</option>
                  </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Your codename will be generated automatically. The event is announced publicly 7 days in advance. One-time only.
                </div>
                <button className="btn btn-primary" onClick={declareScorched} disabled={actionLoading === 'scorched'} style={{ borderColor: 'rgba(224,49,49,0.4)', color: '#E03131' }}>
                  <Flame size={16} /> {actionLoading === 'scorched' ? 'Declaring…' : 'Go Out In Flames'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        border: active ? '1px solid var(--bw-gold)' : '1px solid var(--bw-border)',
        background: active ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
        color: active ? 'var(--bw-gold)' : 'var(--bw-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}
    >
      {icon}
      {label}
    </button>
  )
}
