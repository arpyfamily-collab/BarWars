'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import TurfMap from '@/components/TurfMap'
import { Crosshair, Shield, Swords, MapPin, Flame, ChevronRight, Zap, Clock, Skull, Users, Eye } from 'lucide-react'

interface ActiveClaim {
  id: string
  claim_type: string
  status: string
  window_open_at: string
  window_close_at: string
  required_headcount: number
  attacker_verified_headcount: number
  defender_verified_headcount: number
  attacking_org: { name: string }
  defending_org: { name: string } | null
  bar: { name: string }
}

interface ActiveShot {
  id: string
  status: string
  shots_count: number
  attack_window_opens_at: string
  attack_window_closes_at: string
  attacker_to_arms_at: string | null
  defender_to_arms_at: string | null
  org: { name: string } | null
  bar: { name: string } | null
}

interface MyMembership {
  id: string
  org_id: string
  role: string
  verified: boolean
  org: { name: string; org_type: string; home_turf_bar_id: string | null; turf_streak_weeks: number }
}

interface ThreatBar {
  bar_id: string
  bar_name: string
  threat_level: string
  active_shots_count: number
  turf_holder_name: string | null
  turf_holder_type: string | null
  holder_streak_weeks: number | null
}

const THREAT_CONFIG: Record<string, { label: string; color: string }> = {
  quiet:         { label: 'Quiet',         color: '#2ECC71' },
  tense:         { label: 'Tense',         color: '#F5B800' },
  shots_fired:   { label: 'Shots Fired',   color: '#E03131' },
  active_attack: { label: 'Active Attack',  color: '#E03131' },
}

const CLAIM_TYPE_ICONS: Record<string, typeof Crosshair> = {
  initial_claim: Shield,
  sneak_attack: Crosshair,
  war_declaration: Swords,
}

export default function TurfWarsPage() {
  const [activeClaims, setActiveClaims] = useState<ActiveClaim[]>([])
  const [activeShots, setActiveShots] = useState<ActiveShot[]>([])
  const [myMemberships, setMyMemberships] = useState<MyMembership[]>([])
  const [threatBars, setThreatBars] = useState<ThreatBar[]>([])
  const [loading, setLoading] = useState(true)
  const [toArmsLoading, setToArmsLoading] = useState<string | null>(null)
  const [toArmsResult, setToArmsResult] = useState<Record<string, string>>({})
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    Promise.all([
      fetch('/api/turf-wars?status=live').then(r => r.json()),
      fetch('/api/greek-orgs/memberships').then(r => r.json()),
      fetch('/api/turf-wars/map').then(r => r.json()),
      fetch('/api/turf-wars/shots?status=confirmed').then(r => r.json()),
    ]).then(([claims, memberships, bars, shots]) => {
      setActiveClaims(Array.isArray(claims) ? claims : [])
      setMyMemberships(Array.isArray(memberships) ? memberships : [])
      setThreatBars(Array.isArray(bars) ? bars : [])
      setActiveShots(Array.isArray(shots) ? shots.filter((s: any) => s.status === 'confirmed') : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const myMembership = myMemberships.find(m => m.verified)
  const myOrg = myMembership?.org

  // Determine which active shots are in the wait period (window not yet open)
  const waitPeriodShots = activeShots.filter(s => {
    const opens = new Date(s.attack_window_opens_at)
    return now < opens
  })

  // Check if user is the attacker or defender for a given shot
  function getShotSide(shot: ActiveShot): 'attacker' | 'defender' | null {
    if (!myMembership) return null
    // Check if my org is the attacker (the shot belongs to my org)
    // We need to check via the shots_fired org_id, but the API returns org as a nested object
    // For the attacker check: my org's shots
    if (myMembership.org_id && (shot as any).org_id === myMembership.org_id) return 'attacker'
    // For defender: check if my org holds the bar
    const myOrgHoldsBar = threatBars.some(b =>
      b.bar_id === (shot as any).bar_id && b.turf_holder_name === myOrg?.name
    )
    if (myOrgHoldsBar) return 'defender'
    return null
  }

  async function sendToArms(shotId: string, side: 'attacker' | 'defender') {
    setToArmsLoading(shotId)
    try {
      const res = await fetch('/api/turf-wars/to-arms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_id: shotId, side }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setToArmsResult({ ...toArmsResult, [shotId]: `To Arms sent to ${data.pushed_to} members!` })
      // Update local state to mark as sent
      setActiveShots(prev => prev.map(s =>
        s.id === shotId
          ? { ...s, [side === 'attacker' ? 'attacker_to_arms_at' : 'defender_to_arms_at']: new Date().toISOString() }
          : s
      ))
    } catch (e: any) {
      setToArmsResult({ ...toArmsResult, [shotId]: e.message })
    } finally {
      setToArmsLoading(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em' }}>Turf Wars</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>Claim bars. Hold turf. Defend your ground.</div>
      </div>

      <div className="page-content">
        {/* My Org Card */}
        {myOrg ? (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{myOrg.org_type === 'fraternity' ? '♂' : '♀'}</span>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>{myOrg.name}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Home Turf</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>
                  {myOrg.home_turf_bar_id ? 'Claimed' : 'Unclaimed'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Streak</div>
                <div style={{ fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {myOrg.turf_streak_weeks > 0 && <Flame size={14} style={{ color: 'var(--bw-gold)' }} />}
                  {myOrg.turf_streak_weeks}w
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Link href="/greek">
            <div className="card" style={{ cursor: 'pointer', borderLeft: '3px solid var(--bw-gold)' }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em', marginBottom: 4 }}>Join Greek Life</div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Create or join a fraternity/sorority to participate in turf wars.</div>
            </div>
          </Link>
        )}

        {/* Shots Fired — Wait Period with To Arms */}
        {waitPeriodShots.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E03131', marginBottom: 12 }}>
              Shots Fired — Awaiting Attack Window
            </div>
            <div className="stack stack-sm">
              {waitPeriodShots.map(shot => {
                const opens = new Date(shot.attack_window_opens_at)
                const minsUntilWindow = Math.max(0, Math.floor((opens.getTime() - now.getTime()) / 60000))
                const hoursUntilWindow = Math.floor(minsUntilWindow / 60)
                const minsRemainder = minsUntilWindow % 60
                const side = getShotSide(shot)
                const attackerToArmsSent = !!shot.attacker_to_arms_at
                const defenderToArmsSent = !!shot.defender_to_arms_at
                const mySideSent = side === 'attacker' ? attackerToArmsSent : side === 'defender' ? defenderToArmsSent : false

                return (
                  <div key={shot.id} className="card" style={{ borderLeft: '3px solid #E03131' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Crosshair size={16} style={{ color: '#E03131' }} />
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em' }}>
                        {shot.bar?.name ?? 'Unknown bar'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 6 }}>
                      {shot.org?.name ?? 'An org'} fired shots
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bw-muted)', marginBottom: 10 }}>
                      <Clock size={13} />
                      Window opens in {hoursUntilWindow > 0 && `${hoursUntilWindow}h `}{minsRemainder}m
                    </div>

                    {/* To Arms button — only for orgs involved in this shot */}
                    {side && (
                      <>
                        <button
                          className="btn btn-ghost"
                          style={{
                            width: '100%',
                            borderColor: mySideSent ? 'var(--bw-border)' : 'var(--bw-gold)',
                            color: mySideSent ? 'var(--bw-muted)' : 'var(--bw-gold)',
                            opacity: mySideSent ? 0.6 : 1,
                          }}
                          onClick={() => !mySideSent && sendToArms(shot.id, side)}
                          disabled={mySideSent || toArmsLoading === shot.id}
                        >
                          <Zap size={16} />
                          {toArmsLoading === shot.id ? 'Sending…' : mySideSent ? 'To Arms Sent' : `To Arms — ${side === 'attacker' ? 'Mobilize' : 'Rally Defenders'}`}
                        </button>
                        {toArmsResult[shot.id] && (
                          <div style={{ marginTop: 8, fontSize: 12, color: toArmsResult[shot.id].includes('sent') ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                            {toArmsResult[shot.id]}
                          </div>
                        )}
                      </>
                    )}

                    {/* Show To Arms status for both sides */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, color: 'var(--bw-muted)' }}>
                      <span style={{ color: attackerToArmsSent ? 'var(--bw-gold)' : undefined }}>
                        Attacker: {attackerToArmsSent ? 'To Arms sent' : 'Pending'}
                      </span>
                      <span style={{ color: defenderToArmsSent ? 'var(--bw-gold)' : undefined }}>
                        Defender: {defenderToArmsSent ? 'To Arms sent' : 'Pending'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Active Battles */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Active Battles
          </div>
          <div className="stack stack-sm">
            {activeClaims.map(claim => {
              const Icon = CLAIM_TYPE_ICONS[claim.claim_type] ?? Crosshair
              return (
                <Link key={claim.id} href={`/turf-wars/${claim.id}`}>
                  <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #E03131', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Icon size={16} style={{ color: '#E03131' }} />
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em' }}>
                        {claim.bar?.name}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#E03131', textTransform: 'uppercase', marginLeft: 'auto' }}>
                        Live
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 8 }}>
                      {claim.attacking_org?.name} vs {claim.defending_org?.name ?? 'Neutral'}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <div>
                        <span style={{ color: '#E03131', fontWeight: 700 }}>{claim.attacker_verified_headcount}</span>
                        <span style={{ color: 'var(--bw-muted)' }}> / {claim.required_headcount}</span>
                      </div>
                      <div>
                        <span style={{ color: '#378ADD', fontWeight: 700 }}>{claim.defender_verified_headcount}</span>
                        <span style={{ color: 'var(--bw-muted)' }}> defender</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
            {activeClaims.length === 0 && (
              <div style={{ marginBottom: 8 }}>
                <TurfMap />
              </div>
            )}
          </div>
        </div>

        {/* Turf Map */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Turf Map
          </div>
          <div className="stack stack-sm">
            {threatBars.filter(b => b.threat_level !== 'quiet' || b.turf_holder_name).slice(0, 8).map(bar => {
              const threat = THREAT_CONFIG[bar.threat_level] ?? THREAT_CONFIG.quiet
              return (
                <Link key={bar.bar_id} href={`/turf-wars?bar=${bar.bar_id}`}>
                  <div className="card" style={{ padding: '12px 14px', borderLeft: `3px solid ${threat.color}`, cursor: 'pointer' }}>
                    <div className="row-between">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} style={{ color: 'var(--bw-muted)' }} />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{bar.bar_name}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: threat.color, textTransform: 'uppercase' }}>
                        {threat.label}
                      </span>
                    </div>
                    {bar.turf_holder_name && (
                      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{bar.turf_holder_type === 'fraternity' ? '♂' : '♀'}</span>
                        <span style={{ fontWeight: 600, color: 'var(--bw-text)' }}>{bar.turf_holder_name}</span>
                        {bar.holder_streak_weeks && bar.holder_streak_weeks > 0 && (
                          <span style={{ color: 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Flame size={11} />{bar.holder_streak_weeks}w
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        {myOrg && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
              Actions
            </div>
            <Link href="/turf-wars/file">
              <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>File a Claim</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Claim a neutral bar or attack a rival's turf</div>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
              </div>
            </Link>
            <Link href="/turf-wars/shots">
              <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>Fire Shots</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Signal a sneak attack (weekdays only)</div>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
              </div>
            </Link>
            <Link href="/turf-wars/hall-of-fame">
              <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>Hall of Fame</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>All-time greatest turf war records</div>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
              </div>
            </Link>
          </div>
        )}

        {/* Hessians — always visible */}
        <div style={{ marginTop: 8 }}>
          <Link href="/turf-wars/hessians">
            <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid var(--bw-gold)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Skull size={20} style={{ color: 'var(--bw-gold)' }} />
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>The Hessians</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Mercenary factions. For non-Greek players.</div>
                </div>
              </div>
              <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
            </div>
          </Link>
          <Link href="/turf-wars/regiments" style={{ display: 'block', marginTop: 8 }}>
            <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid #378ADD' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} style={{ color: '#378ADD' }} />
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>Find Your Regiment</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>New here? Find your crew.</div>
                </div>
              </div>
              <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
            </div>
          </Link>
          <Link href="/turf-wars/spies" style={{ display: 'block', marginTop: 8 }}>
            <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid #E03131' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eye size={20} style={{ color: '#E03131' }} />
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>The Spy Network</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Five roles. Trust no one.</div>
                </div>
              </div>
              <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
            </div>
          </Link>
          <Link href="/turf-wars/mercenaries" style={{ display: 'block', marginTop: 8 }}>
            <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid #E03131' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Crosshair size={20} style={{ color: '#E03131' }} />
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>The Exchange</div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Mercenaries. Snipers. Scorched Earth.</div>
                </div>
              </div>
              <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
            </div>
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
