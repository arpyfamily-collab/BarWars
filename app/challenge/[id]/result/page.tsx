'use client'
/**
 * /challenge/[id]/result
 *
 * Post-battle result screen. Shows:
 *   - Winner declaration with final scores
 *   - Veteran badge if earned
 *   - Pass credit earned (winners + consolation for losers)
 *   - Forfeit status for the losing bar
 *   - Share result CTA
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

interface ResultData {
  challenge: {
    id: string
    challenger_bar_id: string
    opponent_bar_id:   string
    winner_bar_id:     string
    challenger_score:  number
    opponent_score:    number
    stakes_description: string
    forfeit_paid:      boolean
    forfeit_deadline:  string
    challenger: { name: string; slug: string }
    opponent:   { name: string; slug: string }
    winner:     { name: string; slug: string }
  }
  myParticipation: {
    chosen_bar_id:      string
    points_contributed: number
    earned_veteran_badge: boolean
    consolation_credit_cents: number
    was_checked_in:     boolean
  } | null
  badge: {
    badge_name: string
    won:        boolean
  } | null
}

export default function ResultPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data,   setData]   = useState<ResultData | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      if (d.user) setUserId(d.user.id)
    })
  }, [])

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: ch } = await supabase
        .from('bar_challenges')
        .select(`
          id, challenger_bar_id, opponent_bar_id, winner_bar_id,
          challenger_score, opponent_score, stakes_description,
          forfeit_paid, forfeit_deadline,
          challenger:venues!challenger_bar_id(name, slug),
          opponent:venues!opponent_bar_id(name, slug),
          winner:venues!winner_bar_id(name, slug)
        `)
        .eq('id', params.id)
        .single()

      if (!ch) return

      // If still live, redirect back to battle
      if (!['completed', 'forfeit_unpaid'].includes((ch as any).status ?? '')) {
        router.replace(`/challenge/${params.id}/battle`)
        return
      }

      let myParticipation = null
      let badge           = null

      if (userId) {
        const { data: part } = await supabase
          .from('challenge_participants')
          .select('chosen_bar_id, points_contributed, earned_veteran_badge, consolation_credit_cents, was_checked_in')
          .eq('challenge_id', params.id)
          .eq('user_id', userId)
          .single()

        myParticipation = part ?? null

        const { data: b } = await supabase
          .from('veteran_badges')
          .select('badge_name, won')
          .eq('challenge_id', params.id)
          .eq('user_id', userId)
          .single()

        badge = b ?? null
      }

      setData({ challenge: ch as any, myParticipation, badge })
    }

    load()
  }, [params.id, userId, router])

  if (!data) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading result…
      </div>
    )
  }

  const { challenge, myParticipation, badge } = data
  const winner     = challenge.winner
  const loser      = challenge.winner_bar_id === challenge.challenger_bar_id
    ? challenge.opponent : challenge.challenger
  const winnerScore = challenge.winner_bar_id === challenge.challenger_bar_id
    ? challenge.challenger_score : challenge.opponent_score
  const loserScore  = challenge.winner_bar_id === challenge.challenger_bar_id
    ? challenge.opponent_score : challenge.challenger_score

  const iWon = myParticipation?.chosen_bar_id === challenge.winner_bar_id
  const iWasCheckedIn = myParticipation?.was_checked_in

  async function shareResult() {
    const text = `${winner.name} won the BarWars war against ${loser.name} — ${winnerScore}–${loserScore}`
    if (navigator.share) {
      await navigator.share({ title: 'BarWars result', text, url: window.location.href })
    } else {
      await navigator.clipboard.writeText(`${text} ${window.location.href}`)
    }
  }

  return (
    <div className="page">
      {/* Winner hero */}
      <div style={{
        padding:      '56px 20px 28px',
        background:   iWon
          ? 'linear-gradient(180deg, rgba(46,204,113,0.12) 0%, transparent 100%)'
          : 'linear-gradient(180deg, rgba(224,49,49,0.08) 0%, transparent 100%)',
        textAlign:    'center',
        borderBottom: '1px solid var(--bw-border)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>
          {iWon ? '🏆' : '⚔️'}
        </div>
        <div style={{
          fontFamily:    'Bebas Neue, sans-serif',
          fontSize:      36,
          letterSpacing: '0.04em',
          lineHeight:    1,
          color:         iWon ? 'var(--bw-green)' : 'var(--bw-text)',
          marginBottom:  6,
        }}>
          {winner.name} wins
        </div>
        <div style={{
          fontFamily:    'Bebas Neue, sans-serif',
          fontSize:      24,
          color:         'var(--bw-muted)',
          letterSpacing: '0.04em',
        }}>
          {winnerScore} – {loserScore}
        </div>
      </div>

      <div className="page-content" style={{ paddingTop: 24 }}>

        {/* Veteran badge */}
        {badge && iWasCheckedIn && (
          <div className="card" style={{
            textAlign:   'center',
            borderColor: iWon ? 'rgba(245,184,0,0.4)' : 'var(--bw-border)',
            background:  iWon ? 'rgba(245,184,0,0.05)' : 'var(--bw-card)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {iWon ? '🎖️' : '🛡️'}
            </div>
            <div style={{
              fontFamily:    'Bebas Neue, sans-serif',
              fontSize:      22,
              letterSpacing: '0.06em',
              color:         iWon ? 'var(--bw-gold)' : 'var(--bw-muted)',
            }}>
              Veteran Badge
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 4 }}>
              {badge.badge_name}
            </div>
          </div>
        )}

        {/* My stats */}
        {myParticipation && (
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 14 }}>
              Your battle stats
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--bw-muted)' }}>Points contributed</span>
                <span style={{ fontWeight: 600, color: 'var(--bw-text)' }}>
                  {myParticipation.points_contributed} pts
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--bw-muted)' }}>Checked in</span>
                <span style={{ fontWeight: 600, color: 'var(--bw-text)' }}>
                  {iWasCheckedIn ? 'Yes' : 'No'}
                </span>
              </div>
              {iWon && iWasCheckedIn && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--bw-muted)' }}>Pass credit earned</span>
                  <span style={{ fontWeight: 600, color: 'var(--bw-green)' }}>$5.00</span>
                </div>
              )}
              {!iWon && myParticipation.consolation_credit_cents > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--bw-muted)' }}>Consolation credit</span>
                  <span style={{ fontWeight: 600, color: 'var(--bw-gold)' }}>
                    ${(myParticipation.consolation_credit_cents / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Forfeit status */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            Stakes outcome
          </div>
          <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 6 }}>
            {challenge.stakes_description}
          </div>
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            fontSize:     12,
            color:        challenge.forfeit_paid ? 'var(--bw-green)' : 'var(--bw-gold)',
            padding:      '8px 12px',
            background:   challenge.forfeit_paid ? 'rgba(46,204,113,0.08)' : 'rgba(245,184,0,0.08)',
            borderRadius: 8,
          }}>
            <span>{challenge.forfeit_paid ? '✅' : '⏳'}</span>
            <span>
              {challenge.forfeit_paid
                ? `${loser.name} paid the forfeit`
                : `${loser.name} has 24 hours to confirm the forfeit`}
            </span>
          </div>
        </div>

        {/* Share */}
        <button
          className="btn btn-primary"
          onClick={shareResult}
          style={{ marginBottom: 8 }}
        >
          Share the result
        </button>

        <button
          className="btn btn-ghost"
          onClick={() => router.push('/')}
        >
          Back to tonight
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
