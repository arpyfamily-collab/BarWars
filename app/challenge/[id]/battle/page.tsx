'use client'
/**
 * /challenge/[id]/battle
 *
 * The live scoreboard. Three states:
 *   1. No side picked yet  → SidePicker
 *   2. Side picked         → full battle view (BattleBar + feed + stats + share)
 *   3. Challenge completed → redirect to /challenge/[id]/result
 *
 * Supabase real-time keeps scores and feed live without polling.
 */

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useChallengeLive } from '@/hooks/useChallengeLive'
import BattleBar        from '@/components/BattleBar'
import BattleCountdown  from '@/components/BattleCountdown'
import ScoreEventFeed   from '@/components/ScoreEventFeed'
import SidePicker       from '@/components/SidePicker'
import ShareCard        from '@/components/ShareCard'
import BottomNav        from '@/components/BottomNav'

export default function BattlePage({ params }: { params: { id: string } }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref') ?? undefined

  const [userId,    setUserId]    = useState<string | undefined>()
  const [shareCard, setShareCard] = useState<{ deep_link: string; headline: string } | null>(null)
  const [didFlip,   setDidFlip]   = useState(false)

  const {
    challenge, scores, recentEvents,
    participantCounts, myParticipation,
    secondsRemaining, connected, loading, prevLeader,
  } = useChallengeLive(params.id, userId)

  // Get current user
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  // Detect lead flip for BattleBar flash
  const prevLeaderRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevLeader !== null && prevLeaderRef.current !== null && prevLeader !== prevLeaderRef.current) {
      setDidFlip(true)
      setTimeout(() => setDidFlip(false), 1500)
    }
    prevLeaderRef.current = prevLeader
  }, [prevLeader])

  // Redirect to result page when challenge completes
  useEffect(() => {
    if (challenge?.status === 'completed' || challenge?.status === 'forfeit_unpaid') {
      router.push(`/challenge/${params.id}/result`)
    }
  }, [challenge?.status, params.id, router])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading battle…
      </div>
    )
  }

  if (!challenge || !scores) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Challenge not found.
      </div>
    )
  }

  const isLive       = challenge.status === 'live'
  const myBarId      = myParticipation?.chosen_bar_id
  const myBarColor   = myBarId === challenge.challenger_bar_id ? '#E24B4A' : '#378ADD'
  const myBar        = myBarId === challenge.challenger_bar_id ? challenge.challenger : challenge.opponent
  const myScore      = myBarId === challenge.challenger_bar_id ? scores.challenger_score : scores.opponent_score
  const theirScore   = myBarId === challenge.challenger_bar_id ? scores.opponent_score  : scores.challenger_score
  const winning      = myScore > theirScore

  return (
    <div className="page">
      {/* Header */}
      <div style={{
        padding:         '48px 20px 20px',
        borderBottom:    '1px solid var(--bw-border)',
        position:        'sticky',
        top:             0,
        background:      'var(--bw-black)',
        zIndex:          10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Connection indicator */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? 'var(--bw-green)' : 'var(--bw-muted)',
              boxShadow:  connected ? '0 0 6px var(--bw-green)' : 'none',
              transition: 'all 0.4s',
            }} />
            <span style={{ fontSize: 11, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {connected ? 'Live' : 'Connecting…'}
            </span>
          </div>
        </div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.12em', color: 'var(--bw-muted)', textTransform: 'uppercase' }}>
          {challenge.challenger.name} vs {challenge.opponent.name}
        </div>
      </div>

      <div className="page-content" style={{ paddingTop: 24 }}>

        {/* Countdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BattleCountdown secondsRemaining={secondsRemaining} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fighters</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--bw-text)' }}>
              {Object.values(participantCounts).reduce((a, b) => a + b, 0)}
            </div>
          </div>
        </div>

        {/* THE BATTLE BAR */}
        <div className="card" style={{ padding: '20px 16px' }}>
          <BattleBar
            challenger={challenge.challenger}
            opponent={challenge.opponent}
            challengerScore={scores.challenger_score}
            opponentScore={scores.opponent_score}
            prevLeader={prevLeader}
            didFlip={didFlip}
          />
        </div>

        {/* Side picker or joined state */}
        {!myParticipation ? (
          <SidePicker
            challengeId={params.id}
            challenger={challenge.challenger}
            opponent={challenge.opponent}
            challengerScore={scores.challenger_score}
            opponentScore={scores.opponent_score}
            trashTalk={challenge.trash_talk}
            stakesDescription={challenge.stakes_description}
            referralCode={referralCode}
            onJoined={p => {
              setShareCard(p.share_card)
            }}
          />
        ) : (
          <>
            {/* My contribution card */}
            <div className="card" style={{ borderColor: `${myBarColor}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: myBarColor, marginBottom: 2 }}>
                    {winning ? 'Your side is winning' : 'Time to fight'}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--bw-text)', fontWeight: 600 }}>
                    Fighting for {myBar?.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: myBarColor, lineHeight: 1 }}>
                    {myParticipation.points_contributed}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--bw-muted)' }}>my pts</div>
                </div>
              </div>

              {/* Participant breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: '#E24B4A', lineHeight: 1 }}>
                    {participantCounts[challenge.challenger_bar_id] ?? 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 2 }}>
                    {challenge.challenger.name.split(' ')[0]} fighters
                  </div>
                </div>
                <div style={{ background: 'var(--bw-surface)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: '#378ADD', lineHeight: 1 }}>
                    {participantCounts[challenge.opponent_bar_id] ?? 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 2 }}>
                    {challenge.opponent.name.split(' ')[0]} fighters
                  </div>
                </div>
              </div>
            </div>

            {/* Share card */}
            {myParticipation.referral_code && (
              <ShareCard
                headline={shareCard?.headline ?? `I'm fighting for ${myBar?.name} tonight`}
                deepLink={shareCard?.deep_link ?? `${window.location.origin}/challenge/${params.id}?ref=${myParticipation.referral_code}`}
                referralCode={myParticipation.referral_code}
                barName={myBar?.name ?? ''}
                barColor={myBarColor}
              />
            )}
          </>
        )}

        {/* Live momentum feed */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Live activity
          </div>
          <div className="card" style={{ padding: '8px 4px' }}>
            <ScoreEventFeed
              events={recentEvents}
              challengerBarId={challenge.challenger_bar_id}
              opponentBarId={challenge.opponent_bar_id}
            />
          </div>
        </div>

        {/* Stakes reminder */}
        <div style={{ textAlign: 'center', padding: '8px 0 16px', color: 'var(--bw-muted)', fontSize: 12 }}>
          Stakes: {challenge.stakes_description}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
