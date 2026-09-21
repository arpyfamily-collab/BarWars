'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { Crosshair, Shield, Users, Clock, Flame, Zap, QrCode, Navigation, UserPlus, Copy, Check, Skull, AlertCircle } from 'lucide-react'

interface ClaimDetail {
  id: string
  claim_type: string
  status: string
  window_open_at: string
  window_close_at: string
  required_headcount: number
  attacker_verified_headcount: number
  defender_verified_headcount: number
  detected_at: string | null
  rally_window_minutes: number
  result: string | null
  attacking_org: { name: string; org_type: string }
  defending_org: { name: string; org_type: string } | null
  bar: { id: string; name: string }
}

interface MyMembership {
  id: string
  org_id: string
  role: string
  verified: boolean
  org: { name: string; org_type: string; home_turf_bar_id: string | null; turf_streak_weeks: number }
}

export default function TurfBattlePage() {
  const params = useParams()
  const router = useRouter()
  const claimId = params.id as string

  const [claim, setClaim] = useState<ClaimDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkinResult, setCheckinResult] = useState<string | null>(null)
  const [rallying, setRallying] = useState(false)
  const [rallyResult, setRallyResult] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const [allyInviteUrl, setAllyInviteUrl] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inviteResult, setInviteResult] = useState<string | null>(null)
  const [hessianCompanies, setHessianCompanies] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [contractResult, setContractResult] = useState<string | null>(null)
  const [contractLoading, setContractLoading] = useState<string | null>(null)

  const fetchClaim = useCallback(() => {
    fetch(`/api/turf-wars/${claimId}`)
      .then(r => r.json())
      .then(d => { setClaim(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [claimId])

  useEffect(() => {
    fetchClaim()
    const interval = setInterval(fetchClaim, 5000)
    return () => clearInterval(interval)
  }, [fetchClaim])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function checkin(method: 'qr_scan' | 'geo_pulse') {
    if (!claim) return
    setCheckingIn(true)
    setCheckinResult(null)

    try {
      const body: any = {
        claim_id: claim.id,
        bar_id: claim.bar?.id ?? '',
        method,
      }

      if (method === 'geo_pulse' && 'geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        })
        body.latitude = pos.coords.latitude
        body.longitude = pos.coords.longitude
      }

      const res = await fetch('/api/turf-wars/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCheckinResult(`Checked in! ${data.attacker_headcount ?? data.defender_headcount} verified at the bar.`)
      fetchClaim()
    } catch (e: any) {
      setCheckinResult(e.message)
    } finally {
      setCheckingIn(false)
    }
  }

  const [memberships, setMemberships] = useState<MyMembership[]>([])

  useEffect(() => {
    fetch('/api/greek-orgs/memberships')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMemberships(d) })
      .catch(() => {})
  }, [])

  // Fetch Hessian companies and contracts for this claim
  useEffect(() => {
    fetch('/api/turf-wars/hessians')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setHessianCompanies(d) })
      .catch(() => {})
    fetch(`/api/turf-wars/hessians/contract?claim_id=${claimId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setContracts(d) })
      .catch(() => {})
  }, [claimId])

  async function rally() {
    if (!claim) return
    setRallying(true)
    setRallyResult(null)

    try {
      const myOrg = memberships.find(m => m.verified)
      if (!myOrg) throw new Error('You must be a verified org member to rally')
      const res = await fetch('/api/turf-wars/rally', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: (myOrg as any).org_id ?? (myOrg as any).org?.id,
          bar_id: (claim as any).bar?.id ?? '',
          claim_id: claim.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRallyResult(`Rally sent to ${data.rallied ?? 0} members!`)
    } catch (e: any) {
      setRallyResult(e.message)
    } finally {
      setRallying(false)
    }
  }

  async function generateAllyInvite() {
    if (!claim) return
    setGeneratingInvite(true)
    setInviteResult(null)
    try {
      const res = await fetch('/api/turf-wars/allies/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claim.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const url = typeof window !== 'undefined' ? `${window.location.origin}${data.invite_url}` : data.invite_url
      setAllyInviteUrl(url)
      setInviteResult('Invite link created — share it with non-members.')
    } catch (e: any) {
      setInviteResult(e.message)
    } finally {
      setGeneratingInvite(false)
    }
  }

  function copyInvite() {
    if (allyInviteUrl && navigator.clipboard) {
      navigator.clipboard.writeText(allyInviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function hireHessian(companyId: string, side: 'attacker' | 'defender') {
    if (!claim) return
    setContractLoading(companyId)
    setContractResult(null)
    try {
      const res = await fetch('/api/turf-wars/hessians/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, claim_id: claim.id, side }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setContractResult(`Contract offered to ${data.company_name ?? 'company'}${data.warning ? ` — ${data.warning}` : ''}`)
      // Refresh contracts
      fetch(`/api/turf-wars/hessians/contract?claim_id=${claimId}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setContracts(d) })
    } catch (e: any) {
      setContractResult(e.message)
    } finally {
      setContractLoading(null)
    }
  }

  async function respondContract(contractId: string, action: 'accept' | 'reject' | 'double_cross', rivalOrgId?: string) {
    setContractLoading(contractId)
    setContractResult(null)
    try {
      const res = await fetch('/api/turf-wars/hessians/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, action, rival_org_id: rivalOrgId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'double_cross') {
        setContractResult(`DOUBLE CROSS executed. Reputation -10. The record is permanent.`)
      } else {
        setContractResult(`Contract ${action}ed.`)
      }
      fetch(`/api/turf-wars/hessians/contract?claim_id=${claimId}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setContracts(d) })
    } catch (e: any) {
      setContractResult(e.message)
    } finally {
      setContractLoading(null)
    }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>
  if (!claim) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Battle not found.</div></div><BottomNav /></div>

  const isLive = claim.status === 'live'
  const windowOpen = new Date(claim.window_open_at)
  const windowClose = new Date(claim.window_close_at)
  const isOpen = now >= windowOpen && now <= windowClose
  const timeRemaining = Math.max(0, windowClose.getTime() - now.getTime())
  const minutesLeft = Math.floor(timeRemaining / 60000)
  const secondsLeft = Math.floor((timeRemaining % 60000) / 1000)

  const attackerPct = Math.min(100, (claim.attacker_verified_headcount / claim.required_headcount) * 100)
  const defenderPct = claim.defender_verified_headcount > 0
    ? Math.min(100, (claim.defender_verified_headcount / claim.required_headcount) * 100)
    : 0

  const ClaimIcon = claim.claim_type === 'initial_claim' ? Shield : claim.claim_type === 'sneak_attack' ? Crosshair : Shield

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer', marginBottom: 12 }} onClick={() => router.push('/turf-wars')}>← Turf Wars</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClaimIcon size={24} style={{ color: isLive ? '#E03131' : 'var(--bw-muted)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, letterSpacing: '0.04em' }}>{claim.bar?.name}</div>
        </div>
      </div>

      <div className="page-content">
        {/* Status banner */}
        {isLive && isOpen && (
          <div style={{
            background: 'rgba(224,49,49,0.1)',
            border: '1px solid rgba(224,49,49,0.3)',
            borderRadius: 14,
            padding: '16px 20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E03131', marginBottom: 4 }}>
              Battle Live
            </div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#E03131', letterSpacing: '0.04em' }}>
              {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>minutes remaining</div>
          </div>
        )}

        {isLive && !isOpen && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 4 }}>
              <Clock size={16} style={{ display: 'inline', marginRight: 4 }} />
              Window opens {windowOpen.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--bw-gold)' }}>
              {Math.ceil((windowOpen.getTime() - now.getTime()) / 60000)} min until battle
            </div>
          </div>
        )}

        {!isLive && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: claim.status === 'successful' ? 'var(--bw-green)' : claim.status === 'failed' ? 'var(--bw-red)' : 'var(--bw-muted)' }}>
              {claim.status === 'successful' ? 'Victory' : claim.status === 'failed' ? 'Defeat' : claim.status === 'contested' ? 'Contested' : claim.status === 'cancelled' ? 'Cancelled' : 'Pending'}
            </div>
            {claim.result && <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 6 }}>{claim.result}</div>}
          </div>
        )}

        {/* Combatants */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#E03131', letterSpacing: '0.08em', marginBottom: 6 }}>Attacker</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{claim.attacking_org?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>{claim.attacking_org?.org_type === 'fraternity' ? 'Fraternity' : 'Sorority'}</div>
            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--bw-muted)' }}>Headcount</span>
                <span style={{ fontWeight: 700, color: '#E03131' }}>{claim.attacker_verified_headcount} / {claim.required_headcount}</span>
              </div>
              <div style={{ height: 8, background: 'var(--bw-surface)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${attackerPct}%`, background: '#E03131', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#378ADD', letterSpacing: '0.08em', marginBottom: 6 }}>Defender</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{claim.defending_org?.name ?? 'Neutral'}</div>
            {claim.defending_org && (
              <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>{claim.defending_org.org_type === 'fraternity' ? 'Fraternity' : 'Sorority'}</div>
            )}
            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--bw-muted)' }}>Headcount</span>
                <span style={{ fontWeight: 700, color: '#378ADD' }}>{claim.defender_verified_headcount}</span>
              </div>
              <div style={{ height: 8, background: 'var(--bw-surface)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${defenderPct}%`, background: '#378ADD', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Sneak attack detection indicator */}
        {claim.claim_type === 'sneak_attack' && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Crosshair size={14} style={{ color: claim.detected_at ? '#E03131' : 'var(--bw-muted)' }} />
              <span style={{ color: claim.detected_at ? '#E03131' : 'var(--bw-muted)' }}>
                {claim.detected_at ? 'Attack detected — defenders alerted' : 'Undetected — gathering forces'}
              </span>
            </div>
          </div>
        )}

        {/* Check-in actions */}
        {isLive && isOpen && (
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
              Check In
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => checkin('qr_scan')}
                disabled={checkingIn}
              >
                <QrCode size={18} />
                {checkingIn ? 'Checking…' : 'Scan QR'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => checkin('geo_pulse')}
                disabled={checkingIn}
              >
                <Navigation size={18} />
                Geo Check
              </button>
            </div>
            {checkinResult && (
              <div style={{ marginTop: 12, fontSize: 13, color: checkinResult.includes('Checked in') ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                {checkinResult}
              </div>
            )}
          </div>
        )}

        {/* Rally button */}
        {isLive && claim.defending_org && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Zap size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Call a Rally</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
              Send a push to all your verified members to get to the bar now.
            </div>
            <button className="btn btn-ghost" onClick={rally} disabled={rallying} style={{ borderColor: 'var(--bw-gold)', color: 'var(--bw-gold)' }}>
              <Flame size={16} />
              {rallying ? 'Rallying…' : 'Rally Your Org'}
            </button>
            {rallyResult && (
              <div style={{ marginTop: 10, fontSize: 13, color: rallyResult.includes('Rally sent') ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                {rallyResult}
              </div>
            )}
          </div>
        )}

        {/* Ally invite */}
        {isLive && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <UserPlus size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Invite Allies</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
              Share a link with non-members. Allies count at 0.5x headcount (0.75x for national brothers).
            </div>
            {allyInviteUrl ? (
              <div>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--bw-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {allyInviteUrl}
                  </span>
                  <button onClick={copyInvite} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-gold)' }}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                {copied && <div style={{ fontSize: 11, color: 'var(--bw-green)', marginTop: 6 }}>Copied to clipboard!</div>}
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={generateAllyInvite} disabled={generatingInvite} style={{ borderColor: 'var(--bw-gold)', color: 'var(--bw-gold)' }}>
                <UserPlus size={16} />
                {generatingInvite ? 'Generating…' : 'Generate Invite Link'}
              </button>
            )}
            {inviteResult && (
              <div style={{ marginTop: 10, fontSize: 12, color: inviteResult.includes('created') ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                {inviteResult}
              </div>
            )}
          </div>
        )}

        {/* Hessian contracts */}
        {isLive && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Skull size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Hessian Contracts</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
              Hire a mercenary company. They check in at 0.75x weight. Check their betrayal record before hiring.
            </div>

            {/* Existing contracts for this claim */}
            {contracts.length > 0 && (
              <div className="stack stack-sm" style={{ marginBottom: 12 }}>
                {contracts.map((c: any) => (
                  <div key={c.id} style={{
                    background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px',
                    border: `1px solid ${c.status === 'betrayed' ? 'rgba(224,49,49,0.3)' : 'var(--bw-border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.company?.name ?? 'Unknown'}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: c.status === 'accepted' ? 'var(--bw-green)' : c.status === 'betrayed' ? 'var(--bw-red)' : c.status === 'pending' ? 'var(--bw-gold)' : 'var(--bw-muted)',
                      }}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                      Hired by {c.org?.name} · {c.side} side · 0.75x weight
                    </div>
                    {c.status === 'betrayed' && (
                      <div style={{ fontSize: 11, color: 'var(--bw-red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={11} /> Double-crossed for the rival org
                      </div>
                    )}
                    {/* Captain actions for pending contracts */}
                    {c.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)' }}
                          onClick={() => respondContract(c.id, 'accept')} disabled={contractLoading === c.id}>
                          Accept
                        </button>
                        <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                          onClick={() => respondContract(c.id, 'reject')} disabled={contractLoading === c.id}>
                          Reject
                        </button>
                        {claim.defending_org && c.side === 'attacker' && (
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(224,49,49,0.5)', color: 'var(--bw-red)' }}
                            onClick={() => respondContract(c.id, 'double_cross', (claim as any).defending_org_id)} disabled={contractLoading === c.id}>
                            <Skull size={12} /> Double Cross
                          </button>
                        )}
                        {claim.attacking_org && c.side === 'defender' && (
                          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(224,49,49,0.5)', color: 'var(--bw-red)' }}
                            onClick={() => respondContract(c.id, 'double_cross', (claim as any).attacking_org_id)} disabled={contractLoading === c.id}>
                            <Skull size={12} /> Double Cross
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Hire available companies */}
            {hessianCompanies.length > 0 && memberships.find(m => m.verified) && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 8 }}>Available Companies</div>
                <div className="stack stack-sm">
                  {hessianCompanies.slice(0, 5).map((comp: any) => {
                    const myMembership = memberships.find(m => m.verified)
                    const isAttacker = myMembership && (claim as any).attacking_org_id === (myMembership as any).org_id
                    const isDefender = myMembership && (claim as any).defending_org_id === (myMembership as any).org_id
                    return (
                      <div key={comp.id} style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{comp.name}</span>
                          <span style={{ fontSize: 11, color: comp.reputation_score > 0 ? 'var(--bw-green)' : comp.reputation_score < 0 ? 'var(--bw-red)' : 'var(--bw-muted)' }}>
                            Rep: {comp.reputation_score > 0 ? '+' : ''}{comp.reputation_score}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 6 }}>
                          {comp.member_count} members
                          {comp.betrayals > 0 && <span style={{ color: 'var(--bw-red)' }}> · {comp.betrayals} betrayals</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isAttacker && (
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(245,184,0,0.3)', color: 'var(--bw-gold)' }}
                              onClick={() => hireHessian(comp.id, 'attacker')} disabled={contractLoading === comp.id}>
                              Hire (Attack)
                            </button>
                          )}
                          {isDefender && (
                            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, borderColor: 'rgba(245,184,0,0.3)', color: 'var(--bw-gold)' }}
                              onClick={() => hireHessian(comp.id, 'defender')} disabled={contractLoading === comp.id}>
                              Hire (Defend)
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {contractResult && (
              <div style={{ marginTop: 10, fontSize: 12, color: contractResult.includes('Contract') || contractResult.includes('DOUBLE') ? 'var(--bw-gold)' : 'var(--bw-red)' }}>
                {contractResult}
              </div>
            )}
          </div>
        )}

        {/* Battle info */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            Battle Details
          </div>
          <div className="stack stack-sm" style={{ fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} style={{ color: 'var(--bw-muted)' }} />
              {windowOpen.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' – '}
              {windowClose.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={14} style={{ color: 'var(--bw-muted)' }} />
              {claim.required_headcount} verified members needed to win
            </div>
            {claim.rally_window_minutes > 0 && (
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                {claim.rally_window_minutes}-minute rally window for defenders
              </div>
            )}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
