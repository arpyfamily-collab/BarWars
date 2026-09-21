'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { Users, UserPlus, Check, X, Skull, Crosshair, Sparkles, AlertCircle, PartyPopper } from 'lucide-react'

interface FinderProfile {
  user_id: string
  nights_out: string
  vibe: string
  situation: string
  pitch: string
  is_looking: boolean
}

interface Match {
  user_id: string
  nights_out: string
  vibe: string
  situation: string
  pitch: string
  compatibility_score: number
}

interface LinksData {
  incoming: any[]
  outgoing: any[]
  linked: any[]
}

interface Regiment {
  id: string
  name: string
  member_count: number
  converted_to_hessian: boolean
  created_at: string
}

interface Raid {
  id: string
  event_date: string
  pitch: string
  max_allies: number | null
  status: string
  window_open_at: string
  window_close_at: string
  org: { name: string; org_type: string }
  bar: { name: string }
}

const VIBE_LABELS: Record<string, string> = {
  trivia: 'Trivia Nights',
  live_music: 'Live Music',
  just_vibing: 'Just Vibing',
  wherever: 'I\'ll Go Wherever',
  in_the_action: 'In the Action',
}

const SITUATION_LABELS: Record<string, string> = {
  new_to_town: 'New to Town',
  transfer: 'Transfer Student',
  no_crew: 'Don\'t Have a Crew Yet',
  friends_graduated: 'My Friends Graduated',
}

const NIGHTS_LABELS: Record<string, string> = {
  mon_thu: 'Mon–Thu',
  fri_sat: 'Fri–Sat',
  both: 'Both',
}

export default function RegimentsPage() {
  const [profile, setProfile] = useState<FinderProfile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [links, setLinks] = useState<LinksData>({ incoming: [], outgoing: [], linked: [] })
  const [raids, setRaids] = useState<Raid[]>([])
  const [myRegiment, setMyRegiment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'finder' | 'links' | 'raids' | 'my_regiment'>('finder')

  // Onboarding form state
  const [nightsOut, setNightsOut] = useState('')
  const [vibe, setVibe] = useState('')
  const [situation, setSituation] = useState('')
  const [pitch, setPitch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Formation state
  const [showFormation, setShowFormation] = useState(false)
  const [regimentName, setRegimentName] = useState('')
  const [formationResult, setFormationResult] = useState<string | null>(null)

  // Link action state
  const [linkLoading, setLinkLoading] = useState<string | null>(null)
  const [linkResult, setLinkResult] = useState<string | null>(null)

  async function loadAll() {
    try {
      const [profRes, linksRes, raidsRes, regRes] = await Promise.all([
        fetch('/api/turf-wars/regiments/finder'),
        fetch('/api/turf-wars/regiments/link'),
        fetch('/api/turf-wars/regiments/raids'),
        fetch('/api/turf-wars/regiments?mine=true'),
      ])
      const profData = await profRes.json()
      const linksData = await linksRes.json()
      const raidsData = await raidsRes.json()
      const regData = await regRes.json()

      if (profData && !profData.error) {
        setProfile(profData)
        setNightsOut(profData.nights_out)
        setVibe(profData.vibe)
        setSituation(profData.situation)
        setPitch(profData.pitch)
        // Load matches
        const matchRes = await fetch('/api/turf-wars/regiments/finder?matches=true')
        const matchData = await matchRes.json()
        if (Array.isArray(matchData)) setMatches(matchData)
      }
      if (linksData && !linksData.error) setLinks(linksData)
      if (Array.isArray(raidsData)) setRaids(raidsData)
      if (regData && !regData.error) setMyRegiment(regData)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function saveProfile() {
    if (!nightsOut || !vibe || !situation) {
      setError('Answer all three questions')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/turf-wars/regiments/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nights_out: nightsOut, vibe, situation, pitch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProfile(data)
      // Load matches
      const matchRes = await fetch('/api/turf-wars/regiments/finder?matches=true')
      const matchData = await matchRes.json()
      if (Array.isArray(matchData)) setMatches(matchData)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function initiateLink(targetUserId: string) {
    setLinkLoading(targetUserId)
    setLinkResult(null)
    try {
      const res = await fetch('/api/turf-wars/regiments/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLinkResult('Link Up request sent!')
      // Reload links
      const linksRes = await fetch('/api/turf-wars/regiments/link')
      const linksData = await linksRes.json()
      if (linksData && !linksData.error) setLinks(linksData)
    } catch (e: any) {
      setLinkResult(e.message)
    } finally {
      setLinkLoading(null)
    }
  }

  async function respondLink(linkId: string, action: 'accept' | 'decline') {
    setLinkLoading(linkId)
    setLinkResult(null)
    try {
      const res = await fetch('/api/turf-wars/regiments/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: linkId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLinkResult(action === 'accept' ? 'Linked!' : 'Declined')
      // Reload links
      const linksRes = await fetch('/api/turf-wars/regiments/link')
      const linksData = await linksRes.json()
      if (linksData && !linksData.error) setLinks(linksData)
    } catch (e: any) {
      setLinkResult(e.message)
    } finally {
      setLinkLoading(null)
    }
  }

  async function formRegiment() {
    if (!regimentName || regimentName.length < 3) {
      setFormationResult('Name must be at least 3 characters')
      return
    }
    const linkedIds = links.linked.map((l: any) => l.user_a === getUserId() ? l.user_b : l.user_a)
    if (linkedIds.length < 4) {
      setFormationResult('You need at least 4 linked companions to form a Regiment')
      return
    }
    setSubmitting(true)
    setFormationResult(null)
    try {
      const res = await fetch('/api/turf-wars/regiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regimentName, member_user_ids: linkedIds.slice(0, 9) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFormationResult(`Regiment "${regimentName}" formed! You are the Captain.`)
      setShowFormation(false)
      // Reload regiment
      const regRes = await fetch('/api/turf-wars/regiments?mine=true')
      const regData = await regRes.json()
      if (regData && !regData.error) setMyRegiment(regData)
    } catch (e: any) {
      setFormationResult(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function getUserId(): string | undefined {
    return profile?.user_id
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  const linkedCount = links.linked.length
  const pendingIncoming = links.incoming.length
  const canFormRegiment = linkedCount >= 4

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={26} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Find Your Regiment</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          {myRegiment ? `Your Regiment: ${myRegiment.regiment?.name}` : 'Connect with compatible students. Form a crew. Find your people.'}
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}

        {/* If already in a regiment, show that first */}
        {myRegiment && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <PartyPopper size={18} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>{myRegiment.regiment?.name}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 10 }}>
              {myRegiment.regiment?.member_count} members
              {myRegiment.regiment?.converted_to_hessian && <span style={{ color: 'var(--bw-gold)' }}> · Converted to Hessian Company</span>}
            </div>
            <div className="stack stack-sm">
              {(myRegiment.members ?? []).map((m: any) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--bw-muted)' }}>Member</span>
                  <span style={{ fontWeight: 600, color: m.role === 'captain' ? 'var(--bw-gold)' : 'var(--bw-text)' }}>
                    {m.role === 'captain' ? 'Captain' : 'Member'}
                  </span>
                </div>
              ))}
            </div>
            {!myRegiment.regiment?.converted_to_hessian && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--bw-muted)' }}>
                <Link href="/turf-wars/hessians" style={{ color: 'var(--bw-gold)' }}>
                  Convert to a Hessian Company →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Tab navigation */}
        {!myRegiment && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <TabBtn active={view === 'finder'} onClick={() => setView('finder')} icon={<Sparkles size={14} />} label="Finder" />
            <TabBtn active={view === 'links'} onClick={() => setView('links')} icon={<UserPlus size={14} />} label={`Links${pendingIncoming > 0 ? ` (${pendingIncoming})` : ''}`} />
            <TabBtn active={view === 'raids'} onClick={() => setView('raids')} icon={<Crosshair size={14} />} label="Raids" />
          </div>
        )}

        {/* FINDER TAB */}
        {view === 'finder' && !myRegiment && (
          <>
            {!profile ? (
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
                  Are You Looking for Your People?
                </div>
                <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Answer a few questions. We&apos;ll match you with compatible students who are also looking for a crew.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>What nights do you go out?</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {Object.entries(NIGHTS_LABELS).map(([val, label]) => (
                      <button key={val} onClick={() => setNightsOut(val)}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: nightsOut === val ? '1px solid var(--bw-gold)' : '1px solid var(--bw-border)',
                          background: nightsOut === val ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
                          color: nightsOut === val ? 'var(--bw-gold)' : 'var(--bw-muted)', cursor: 'pointer',
                        }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>What&apos;s your vibe?</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {Object.entries(VIBE_LABELS).map(([val, label]) => (
                      <button key={val} onClick={() => setVibe(val)}
                        style={{
                          padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: vibe === val ? '1px solid var(--bw-gold)' : '1px solid var(--bw-border)',
                          background: vibe === val ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
                          color: vibe === val ? 'var(--bw-gold)' : 'var(--bw-muted)', cursor: 'pointer',
                        }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>What&apos;s your situation?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {Object.entries(SITUATION_LABELS).map(([val, label]) => (
                      <button key={val} onClick={() => setSituation(val)}
                        style={{
                          padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: 'left',
                          border: situation === val ? '1px solid var(--bw-gold)' : '1px solid var(--bw-border)',
                          background: situation === val ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
                          color: situation === val ? 'var(--bw-gold)' : 'var(--bw-muted)', cursor: 'pointer',
                        }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>What do you bring to the table?</label>
                  <textarea
                    className="input"
                    value={pitch}
                    onChange={e => setPitch(e.target.value)}
                    placeholder="One line. Make it count. Funny answers get more links."
                    maxLength={140}
                    style={{ marginTop: 6, minHeight: 60 }}
                  />
                </div>

                <button className="btn btn-primary" onClick={saveProfile} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Find My People'}
                </button>
              </div>
            ) : (
              <>
                {/* Profile summary */}
                <div className="card" style={{ background: 'var(--bw-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>Your Profile</span>
                    <span style={{ fontSize: 11, color: profile.is_looking ? 'var(--bw-green)' : 'var(--bw-muted)' }}>
                      {profile.is_looking ? 'Looking' : 'Not Looking'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.5 }}>
                    <div><b>Nights:</b> {NIGHTS_LABELS[profile.nights_out]}</div>
                    <div><b>Vibe:</b> {VIBE_LABELS[profile.vibe]}</div>
                    <div><b>Situation:</b> {SITUATION_LABELS[profile.situation]}</div>
                    {profile.pitch && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--bw-muted)' }}>&ldquo;{profile.pitch}&rdquo;</div>}
                  </div>
                </div>

                {/* Formation prompt */}
                {canFormRegiment && !showFormation && (
                  <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <PartyPopper size={16} style={{ color: 'var(--bw-gold)' }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>You have {linkedCount} linked companions!</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12 }}>
                      That&apos;s enough to form a Regiment. Pick a name and make it official.
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowFormation(true)}>
                      <Skull size={16} /> Form Your Regiment
                    </button>
                  </div>
                )}

                {showFormation && (
                  <div className="card">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                      Name Your Regiment
                    </div>
                    <input
                      className="input"
                      value={regimentName}
                      onChange={e => setRegimentName(e.target.value)}
                      placeholder="e.g. The Oxford Orphans, Thursday Wrecking Crew"
                      maxLength={40}
                      style={{ marginBottom: 12 }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 12 }}>
                      {linkedCount} members will be included. You will be the Captain.
                    </div>
                    {formationResult && (
                      <div style={{ fontSize: 12, color: formationResult.includes('formed') ? 'var(--bw-green)' : 'var(--bw-red)', marginBottom: 10 }}>
                        {formationResult}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={formRegiment} disabled={submitting}>
                        {submitting ? 'Forming…' : 'Make It Official'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setShowFormation(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Matches */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                    Suggested Link-Ups
                  </div>
                  <div className="stack stack-sm">
                    {matches.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                        No compatible matches right now. Check back later — new students are joining.
                      </div>
                    ) : matches.map(m => (
                      <div key={m.user_id} className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--bw-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, color: 'var(--bw-gold)',
                            }}>
                              {m.compatibility_score}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>compatibility</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 6 }}>
                          <span style={{ color: 'var(--bw-muted)' }}>Goes out </span>
                          <b>{NIGHTS_LABELS[m.nights_out]}</b>
                          <span style={{ color: 'var(--bw-muted)' }}> · </span>
                          <b>{VIBE_LABELS[m.vibe]}</b>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 6 }}>
                          {SITUATION_LABELS[m.situation]}
                        </div>
                        {m.pitch && (
                          <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--bw-text)', marginBottom: 10, lineHeight: 1.4 }}>
                            &ldquo;{m.pitch}&rdquo;
                          </div>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ width: '100%', borderColor: 'rgba(245,184,0,0.3)', color: 'var(--bw-gold)' }}
                          onClick={() => initiateLink(m.user_id)}
                          disabled={linkLoading === m.user_id}
                        >
                          <UserPlus size={14} />
                          {linkLoading === m.user_id ? 'Sending…' : 'Link Up'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {linkResult && (
                  <div style={{ marginTop: 8, fontSize: 12, color: linkResult.includes('sent') || linkResult.includes('Linked') ? 'var(--bw-green)' : 'var(--bw-red)' }}>
                    {linkResult}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* LINKS TAB */}
        {view === 'links' && !myRegiment && (
          <>
            {/* Incoming requests */}
            {links.incoming.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-gold)', marginBottom: 12 }}>
                  Pending Requests ({links.incoming.length})
                </div>
                <div className="stack stack-sm">
                  {links.incoming.map((l: any) => {
                    const otherId = l.user_a === getUserId() ? l.user_b : l.user_a
                    return (
                      <div key={l.id} className="card">
                        <div style={{ fontSize: 13, marginBottom: 10 }}>Someone wants to Link Up with you!</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(46,204,113,0.3)', color: 'var(--bw-green)' }}
                            onClick={() => respondLink(l.id, 'accept')} disabled={linkLoading === l.id}>
                            <Check size={14} /> Accept
                          </button>
                          <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'rgba(224,49,49,0.3)', color: 'var(--bw-red)' }}
                            onClick={() => respondLink(l.id, 'decline')} disabled={linkLoading === l.id}>
                            <X size={14} /> Decline
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Linked */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                Your Connections ({linkedCount})
              </div>
              <div className="stack stack-sm">
                {links.linked.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                    No connections yet. Go to the Finder tab to find your people.
                  </div>
                ) : links.linked.map((l: any) => (
                  <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(46,204,113,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={16} style={{ color: 'var(--bw-green)' }} />
                    </div>
                    <span style={{ fontSize: 13 }}>Linked</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Outgoing pending */}
            {links.outgoing.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
                  Sent Requests ({links.outgoing.length})
                </div>
                <div className="stack stack-sm">
                  {links.outgoing.map((l: any) => (
                    <div key={l.id} className="card" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                      Pending — waiting for response
                    </div>
                  ))}
                </div>
              </div>
            )}

            {linkResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: linkResult.includes('Linked') ? 'var(--bw-green)' : linkResult.includes('Declined') ? 'var(--bw-muted)' : 'var(--bw-red)' }}>
                {linkResult}
              </div>
            )}
          </>
        )}

        {/* RAIDS TAB */}
        {view === 'raids' && !myRegiment && (
          <div>
            <div className="card" style={{ background: 'var(--bw-surface)', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8 }}>
                Regiment Raids
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
                Greek orgs are opening their doors. Show up to a raid, check in as an Ally, and experience the vibe. No commitment — just a reason to be somewhere with a role when you get there.
              </div>
            </div>
            <div className="stack stack-sm">
              {raids.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                  No open raids right now. Check back during rush season.
                </div>
              ) : raids.map(raid => (
                <div key={raid.id} className="card" style={{ borderLeft: '3px solid #378ADD' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Crosshair size={14} style={{ color: '#378ADD' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em' }}>{raid.bar?.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 6 }}>
                    Hosted by <b style={{ color: 'var(--bw-text)' }}>{raid.org?.name}</b>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 8, lineHeight: 1.4 }}>
                    {raid.pitch || 'Come see what we\'re about. No pressure, no commitment.'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                    {new Date(raid.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {raid.max_allies && ` · Max ${raid.max_allies} allies`}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
        flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
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
