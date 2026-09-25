'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { Eye, Skull, Shield, Ghost as GhostIcon, Crosshair, AlertCircle, Check, X, FileText, Flame, BadgeCheck, Sparkles, Send } from 'lucide-react'

interface Recruitment {
  id: string
  recruiter_type: string
  status: string
  is_platform_test: boolean
  loyalty_flag: string | null
  created_at: string
}

interface SpyAsset {
  id: string
  spy_type: string
  handler_type: string
  is_active: boolean
  burned: boolean
  burned_at: string | null
  created_at: string
}

interface Badge {
  id: string
  badge_type: string
  awarded_at: string
  detail: string
}

interface Cultivation {
  id: string
  offer_type: string
  offer_detail: string
  status: string
  intel_quality_rating: number | null
  created_at: string
  cultivator_org_id: string | null
  cultivator_company_id: string | null
}

interface MoleHunt {
  id: string
  status: string
  fake_event_date: string
  fake_claim_type: string
  suspected_mole_id: string | null
  created_at: string
  bar: { name: string } | null
}

interface GhostProfile {
  id: string
  codename: string
  upgrade_eligible: boolean
  reports_count: number
}

interface GhostReport {
  id: string
  observation: string
  orgs_present: string | null
  headcount_estimate: number | null
  quality_rating: number | null
  created_at: string
}

export default function SpyNetworkPage() {
  const [view, setView] = useState<'dashboard' | 'approaches' | 'intel' | 'mole_hunt' | 'ghost' | 'badges'>('dashboard')
  const [loading, setLoading] = useState(true)

  // Spy state
  const [recruitments, setRecruitments] = useState<{ pending: Recruitment[]; resolved: Recruitment[] }>({ pending: [], resolved: [] })
  const [assets, setAssets] = useState<{ myAssets: SpyAsset[]; handledAssets: SpyAsset[]; badges: Badge[] }>({ myAssets: [], handledAssets: [], badges: [] })
  const [cultivations, setCultivations] = useState<{ asTarget: Cultivation[]; asCultivator: any[] }>({ asTarget: [], asCultivator: [] })
  const [moleHunts, setMoleHunts] = useState<MoleHunt[]>([])
  const [ghostProfile, setGhostProfile] = useState<GhostProfile | null>(null)
  const [ghostReports, setGhostReports] = useState<GhostReport[]>([])
  const [intel, setIntel] = useState<any[]>([])

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<string | null>(null)

  // Intel form
  const [intelType, setIntelType] = useState('')
  const [intelContent, setIntelContent] = useState('')

  // Ghost report form
  const [ghostObservation, setGhostObservation] = useState('')
  const [ghostOrgs, setGhostOrgs] = useState('')
  const [ghostHeadcount, setGhostHeadcount] = useState('')

  // Mole hunt form
  const [moleBarId, setMoleBarId] = useState('')
  const [moleDate, setMoleDate] = useState('')
  const [moleClaimType, setMoleClaimType] = useState('sneak_attack')

  async function loadAll() {
    try {
      const [recRes, assetsRes, cultRes, moleRes, ghostRes, intelRes] = await Promise.all([
        fetch('/api/turf-wars/spies/recruit'),
        fetch('/api/turf-wars/spies/assets'),
        fetch('/api/turf-wars/spies/cultivate'),
        fetch('/api/turf-wars/spies/mole-hunt'),
        fetch('/api/turf-wars/spies/ghost'),
        fetch('/api/turf-wars/spies/intel'),
      ])
      const recData = await recRes.json()
      const assetsData = await assetsRes.json()
      const cultData = await cultRes.json()
      const moleData = await moleRes.json()
      const ghostData = await ghostRes.json()
      const intelData = await intelRes.json()

      if (recData && !recData.error) setRecruitments(recData)
      if (assetsData && !assetsData.error) setAssets(assetsData)
      if (cultData && !cultData.error) setCultivations(cultData)
      if (Array.isArray(moleData)) setMoleHunts(moleData)
      if (ghostData && !ghostData.error) {
        if (ghostData.profile) {
          setGhostProfile(ghostData.profile)
          setGhostReports(ghostData.reports ?? [])
        }
      }
      if (Array.isArray(intelData)) setIntel(intelData)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function respondRecruitment(id: string, action: 'accept' | 'delete' | 'report') {
    setActionLoading(id)
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/recruit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruitment_id: id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult(action === 'accept' ? 'You accepted the approach. You are now an active spy asset.' : action === 'report' ? 'Reported to your org leadership.' : 'Approach deleted.')
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function respondCultivation(id: string, action: 'accept' | 'decline') {
    setActionLoading(id)
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/cultivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cultivation_id: id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult(action === 'accept' ? `Cultivation accepted. You are now a ${data.spy_type}.` : 'Cultivation declined.')
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function submitIntel() {
    if (!intelType || !intelContent) { setActionResult('Select intel type and write your report'); return }
    setActionLoading('intel')
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intel_type: intelType, content: intelContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult('Intel delivered. This report expires in 24 hours.')
      setIntelType('')
      setIntelContent('')
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function activateMoleHunt() {
    if (!moleBarId || !moleDate) { setActionResult('Bar and date required'); return }
    setActionLoading('mole')
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/mole-hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fake_bar_id: moleBarId, fake_event_date: moleDate, fake_claim_type: moleClaimType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult('Mole hunt activated. False intelligence planted. Watch for the leak.')
      setMoleBarId('')
      setMoleDate('')
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function createGhost() {
    setActionLoading('ghost_create')
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/ghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult(`You are now ${data.codename}. Submit observation reports from events you attend.`)
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function submitGhostReport() {
    if (!ghostObservation || ghostObservation.length < 10) { setActionResult('Observation must be at least 10 characters'); return }
    setActionLoading('ghost_report')
    setActionResult(null)
    try {
      const res = await fetch('/api/turf-wars/spies/ghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observation: ghostObservation,
          orgs_present: ghostOrgs || null,
          headcount_estimate: ghostHeadcount ? parseInt(ghostHeadcount) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionResult(data.upgrade_eligible ? data.message : 'Report submitted.')
      if (data.upgrade_eligible) {
        setActionResult('Three reports submitted! You\'re eligible for a full upgrade.')
      } else {
        setActionResult(`Report submitted. ${data.reports_count ?? 0} total.`)
      }
      setGhostObservation('')
      setGhostOrgs('')
      setGhostHeadcount('')
      loadAll()
    } catch (e: any) {
      setActionResult(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  const hasPendingApproach = recruitments.pending.length > 0
  const isSpy = assets.myAssets.some(a => a.is_active)
  const isHandler = assets.handledAssets.length > 0
  const isBurned = assets.myAssets.some(a => a.burned)
  const hasBadges = assets.badges.length > 0
  const pendingCultivations = cultivations.asTarget.filter(c => c.status === 'pending')

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Eye size={26} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, letterSpacing: '0.04em' }}>The Spy Network</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Five roles. Every war has spies. Trust no one.
        </div>
      </div>

      <div className="page-content">
        {actionResult && (
          <div className="card" style={{
            borderColor: actionResult.includes('error') || actionResult.includes('Error') ? 'rgba(224,49,49,0.3)' : 'rgba(245,184,0,0.3)',
            background: actionResult.includes('error') || actionResult.includes('Error') ? 'rgba(224,49,49,0.08)' : 'rgba(245,184,0,0.08)',
          }}>
            <div style={{ fontSize: 13, color: actionResult.includes('error') || actionResult.includes('Error') ? 'var(--bw-red)' : 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{actionResult}
            </div>
          </div>
        )}

        {/* Pending approach alert */}
        {hasPendingApproach && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)', animation: 'pulse 2s infinite' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>You&apos;ve Been Approached</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              An interested party wants to know if you&apos;re loyal — or available. Accept or delete. This message will not repeat.
            </div>
            {recruitments.pending.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(245,184,0,0.3)', color: 'var(--bw-gold)', fontSize: 12 }}
                  onClick={() => respondRecruitment(r.id, 'accept')} disabled={actionLoading === r.id}>
                  Accept
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)', fontSize: 12 }}
                  onClick={() => respondRecruitment(r.id, 'report')} disabled={actionLoading === r.id}>
                  Report It
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }}
                  onClick={() => respondRecruitment(r.id, 'delete')} disabled={actionLoading === r.id}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pending cultivation requests */}
        {pendingCultivations.length > 0 && (
          <div className="card" style={{ borderLeft: '3px solid #378ADD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={16} style={{ color: '#378ADD' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Cultivation Requests ({pendingCultivations.length})</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
              An org or Hessian Company wants to cultivate you as an intelligence asset.
            </div>
            {pendingCultivations.map(c => (
              <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--bw-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--bw-text)', marginBottom: 4 }}>
                  Offer: <b>{c.offer_type.replace('_', ' ')}</b>
                </div>
                {c.offer_detail && <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 6 }}>{c.offer_detail}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)', fontSize: 12 }}
                    onClick={() => respondCultivation(c.id, 'accept')} disabled={actionLoading === c.id}>
                    <Check size={12} /> Accept
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)', fontSize: 12 }}
                    onClick={() => respondCultivation(c.id, 'decline')} disabled={actionLoading === c.id}>
                    <X size={12} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Badges */}
        {hasBadges && (
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
              Your Credentials
            </div>
            <div className="stack stack-sm">
              {assets.badges.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderRadius: 8, background: 'var(--bw-surface)',
                  border: `1px solid ${b.badge_type === 'burned' ? 'rgba(224,49,49,0.3)' : b.badge_type === 'mata_hari' ? 'rgba(245,184,0,0.3)' : 'rgba(46,204,113,0.3)'}`,
                }}>
                  {b.badge_type === 'burned' ? <Skull size={14} style={{ color: 'var(--bw-red)' }} /> :
                   b.badge_type === 'mata_hari' ? <Eye size={14} style={{ color: 'var(--bw-gold)' }} /> :
                   <BadgeCheck size={14} style={{ color: 'var(--bw-green)' }} />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: b.badge_type === 'burned' ? 'var(--bw-red)' : b.badge_type === 'mata_hari' ? 'var(--bw-gold)' : 'var(--bw-green)' }}>
                    {b.badge_type === 'burned' ? 'BURNED' : b.badge_type === 'mata_hari' ? 'MATA HARI' : 'HIGH LOYALTY'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--bw-muted)', marginLeft: 'auto' }}>{b.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          <TabBtn active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<Eye size={13} />} label="Dashboard" />
          <TabBtn active={view === 'intel'} onClick={() => setView('intel')} icon={<FileText size={13} />} label="Intel" />
          <TabBtn active={view === 'mole_hunt'} onClick={() => setView('mole_hunt')} icon={<Crosshair size={13} />} label="Mole Hunt" />
          <TabBtn active={view === 'ghost'} onClick={() => setView('ghost')} icon={<GhostIcon size={13} />} label="Ghost" />
        </div>

        {/* DASHBOARD */}
        {view === 'dashboard' && (
          <>
            {/* Active spy status */}
            {isSpy && (
              <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Eye size={16} style={{ color: 'var(--bw-gold)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Active Spy Asset</span>
                </div>
                <div className="stack stack-sm" style={{ fontSize: 12 }}>
                  {assets.myAssets.filter(a => a.is_active).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--bw-muted)' }}>Type: <b style={{ color: 'var(--bw-text)' }}>{a.spy_type.replace('_', ' ')}</b></span>
                      <span style={{ color: 'var(--bw-muted)' }}>Handler: <b style={{ color: 'var(--bw-text)' }}>{a.handler_type}</b></span>
                    </div>
                  ))}
                </div>
                {isBurned && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Skull size={12} /> You have been burned. Your spy status is public.
                  </div>
                )}
              </div>
            )}

            {/* Handler assets */}
            {isHandler && (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Shield size={16} style={{ color: '#378ADD' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Assets You Handle ({assets.handledAssets.length})</span>
                </div>
                <div className="stack stack-sm" style={{ fontSize: 12 }}>
                  {assets.handledAssets.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--bw-muted)' }}>
                      <span>Type: <b style={{ color: 'var(--bw-text)' }}>{a.spy_type.replace('_', ' ')}</b></span>
                      {a.burned && <span style={{ color: 'var(--bw-red)' }}>Burned</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spy types overview */}
            <div className="card" style={{ background: 'var(--bw-surface)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                The Five Spy Types
              </div>
              <div className="stack stack-sm" style={{ fontSize: 12, lineHeight: 1.6 }}>
                <SpyTypeRow icon={<Eye size={13} style={{ color: 'var(--bw-gold)' }} />} name="Infiltrator" desc="Greek member turned. Reports intel to handler. Can be burned." />
                <SpyTypeRow icon={<Shield size={13} style={{ color: '#378ADD' }} />} name="Bar Asset" desc="Bar employee who reports visible intel. Any faction can cultivate." />
                <SpyTypeRow icon={<Skull size={13} style={{ color: 'var(--bw-red)' }} />} name="Double Agent" desc="Hessian cultivated by 2+ orgs. Exposure earns the Mata Hari badge." />
                <SpyTypeRow icon={<GhostIcon size={13} style={{ color: 'var(--bw-muted)' }} />} name="Ghost" desc="Anonymous observer. 3 reports earns a full upgrade." />
                <SpyTypeRow icon={<BadgeCheck size={13} style={{ color: 'var(--bw-green)' }} />} name="Loyalty Test" desc="Platform-issued. Accept = susceptible. Report = high loyalty." />
              </div>
            </div>
          </>
        )}

        {/* INTEL TAB */}
        {view === 'intel' && (
          <>
            {isSpy ? (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Submit Intel Report
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Intel Type</label>
                  <select className="input" value={intelType} onChange={e => setIntelType(e.target.value)} style={{ marginTop: 6 }}>
                    <option value="">Select type…</option>
                    <option value="headcount">Current headcount at bar</option>
                    <option value="shots_fired_plan">Shots Fired plan (next 48h)</option>
                    <option value="war_declaration_plan">War Declaration being planned</option>
                    <option value="bar_observation">Bar room observation</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Report</label>
                  <textarea
                    className="input"
                    value={intelContent}
                    onChange={e => setIntelContent(e.target.value)}
                    placeholder="What did you see or hear? This expires in 24 hours."
                    style={{ marginTop: 6, minHeight: 80 }}
                    maxLength={500}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Intel messages are non-selectable. No screenshots. Reports auto-delete after 24 hours.
                </div>
                <button className="btn btn-primary" onClick={submitIntel} disabled={actionLoading === 'intel'}>
                  <Send size={16} /> {actionLoading === 'intel' ? 'Sending…' : 'Deliver Intel'}
                </button>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                You are not an active spy asset. Accept a recruitment approach to start submitting intel.
              </div>
            )}

            {/* Intel feed (as handler) */}
            {isHandler && intel.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Intel Received ({intel.length})
                </div>
                <div className="stack stack-sm">
                  {intel.map((i: any) => (
                    <div key={i.id} className="card" style={{ userSelect: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--bw-gold)' }}>
                          {i.intel_type.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--bw-muted)' }}>
                          Expires {new Date(i.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.4, userSelect: 'none' }}>
                        {i.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* MOLE HUNT TAB */}
        {view === 'mole_hunt' && (
          <>
            <div className="card" style={{ background: 'var(--bw-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Crosshair size={16} style={{ color: '#E03131' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Mole Hunt</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5, marginBottom: 12 }}>
                Plant false intelligence — a fake attack plan at a specific bar on a specific night. If the intel leaks to rivals, you have a mole. One use per org per semester.
              </div>
            </div>

            {/* Active mole hunts */}
            {moleHunts.length > 0 && (
              <div className="stack stack-sm" style={{ marginBottom: 8 }}>
                {moleHunts.map(h => (
                  <div key={h.id} className="card" style={{
                    borderLeft: `3px solid ${h.status === 'active' ? 'var(--bw-gold)' : h.status === 'mole_found' ? 'var(--bw-red)' : 'var(--bw-muted)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{h.bar?.name ?? 'Unknown bar'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: h.status === 'active' ? 'var(--bw-gold)' : h.status === 'mole_found' ? 'var(--bw-red)' : 'var(--bw-muted)' }}>
                        {h.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                      {h.fake_claim_type === 'sneak_attack' ? 'Sneak Attack' : 'War Declaration'} · {new Date(h.fake_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Activate new mole hunt */}
            <div className="card">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                Activate a Mole Hunt
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Target Bar (bait)</label>
                <input className="input" value={moleBarId} onChange={e => setMoleBarId(e.target.value)} placeholder="Bar ID" style={{ marginTop: 6 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Fake Event Date</label>
                <input className="input" type="date" value={moleDate} onChange={e => setMoleDate(e.target.value)} style={{ marginTop: 6 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Fake Claim Type</label>
                <select className="input" value={moleClaimType} onChange={e => setMoleClaimType(e.target.value)} style={{ marginTop: 6 }}>
                  <option value="sneak_attack">Sneak Attack</option>
                  <option value="war_declaration">War Declaration</option>
                </select>
              </div>
              <button className="btn btn-primary" onClick={activateMoleHunt} disabled={actionLoading === 'mole'} style={{ borderColor: 'rgba(224,49,49,0.4)', color: 'var(--bw-red)' }}>
                <Flame size={16} /> {actionLoading === 'mole' ? 'Activating…' : 'Plant False Intelligence'}
              </button>
            </div>
          </>
        )}

        {/* GHOST TAB */}
        {view === 'ghost' && (
          <>
            {!ghostProfile ? (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <GhostIcon size={16} style={{ color: 'var(--bw-muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Become a Ghost</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5, marginBottom: 12 }}>
                  You were at a bar during a turf war standoff. You saw things. Create a burner profile with a codename and submit anonymous observation reports. Three quality reports earn you a full upgrade — become a Hessian, join a Regiment, or take a specific spy role.
                </div>
                <button className="btn btn-primary" onClick={createGhost} disabled={actionLoading === 'ghost_create'}>
                  <GhostIcon size={16} /> {actionLoading === 'ghost_create' ? 'Materializing…' : 'Get Your Codename'}
                </button>
              </div>
            ) : (
              <>
                <div className="card" style={{ borderLeft: '3px solid var(--bw-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <GhostIcon size={16} style={{ color: 'var(--bw-muted)' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>{ghostProfile.codename}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                    {ghostProfile.reports_count} report{ghostProfile.reports_count !== 1 ? 's' : ''} submitted
                    {ghostProfile.upgrade_eligible && <span style={{ color: 'var(--bw-gold)' }}> · Eligible for full upgrade</span>}
                  </div>
                </div>

                {ghostProfile.upgrade_eligible && (
                  <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Sparkles size={16} style={{ color: 'var(--bw-gold)' }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Upgrade Available</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>
                      You&apos;ve proven yourself. Choose your path:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Link href="/turf-wars/hessians" style={{ fontSize: 12, color: 'var(--bw-gold)' }}>→ Become a Hessian</Link>
                      <Link href="/turf-wars/regiments" style={{ fontSize: 12, color: '#378ADD' }}>→ Join a Regiment</Link>
                    </div>
                  </div>
                )}

                {/* Submit report */}
                <div className="card">
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                    Submit Observation Report
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>What did you see?</label>
                    <textarea
                      className="input"
                      value={ghostObservation}
                      onChange={e => setGhostObservation(e.target.value)}
                      placeholder="Describe what you witnessed — orgs present, headcounts, atmosphere, any overheard conversations…"
                      style={{ marginTop: 6, minHeight: 80 }}
                      maxLength={500}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Orgs Present</label>
                      <input className="input" value={ghostOrgs} onChange={e => setGhostOrgs(e.target.value)} placeholder="e.g. Kappa Manor, The Cabana" style={{ marginTop: 6 }} />
                    </div>
                    <div style={{ width: 100 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Headcount</label>
                      <input className="input" type="number" value={ghostHeadcount} onChange={e => setGhostHeadcount(e.target.value)} placeholder="~50" style={{ marginTop: 6 }} />
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={submitGhostReport} disabled={actionLoading === 'ghost_report'}>
                    <Send size={16} /> {actionLoading === 'ghost_report' ? 'Submitting…' : 'Submit Report'}
                  </button>
                </div>

                {/* Past reports */}
                {ghostReports.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                      Your Reports ({ghostReports.length})
                    </div>
                    <div className="stack stack-sm">
                      {ghostReports.map(r => (
                        <div key={r.id} className="card">
                          <div style={{ fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.4, marginBottom: 6 }}>{r.observation}</div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--bw-muted)' }}>
                            {r.orgs_present && <span>Orgs: {r.orgs_present}</span>}
                            {r.headcount_estimate && <span>~{r.headcount_estimate} people</span>}
                            {r.quality_rating && <span style={{ color: 'var(--bw-gold)' }}>Rated {r.quality_rating}/5</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
        flex: '1 0 auto', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
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

function SpyTypeRow({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      {icon}
      <div>
        <div style={{ fontWeight: 600, color: 'var(--bw-text)', fontSize: 12 }}>{name}</div>
        <div style={{ color: 'var(--bw-muted)', fontSize: 11 }}>{desc}</div>
      </div>
    </div>
  )
}
