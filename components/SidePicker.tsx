'use client'
/**
 * SidePicker
 *
 * Shown when the user hasn't picked a side yet.
 * Displays current odds, stakes, and the trash talk line.
 * On pick, POSTs to /api/challenges/[id]/join and returns the share card.
 */

import { useState } from 'react'
import type { ChallengeBar } from '@/hooks/useChallengeLive'

interface Props {
  challengeId:       string
  challenger:        ChallengeBar
  opponent:          ChallengeBar
  challengerScore:   number
  opponentScore:     number
  trashTalk:         string
  stakesDescription: string
  referralCode?:     string   // pre-filled from URL ?ref= param
  onJoined: (participation: {
    chosen_bar_id:      string
    points_contributed: number
    referral_code:      string
    share_card:         { deep_link: string; headline: string }
  }) => void
}

export default function SidePicker({
  challengeId, challenger, opponent,
  challengerScore, opponentScore,
  trashTalk, stakesDescription,
  referralCode, onJoined,
}: Props) {
  const [picking,  setPicking]  = useState<'challenger' | 'opponent' | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const total          = challengerScore + opponentScore
  const challengerOdds = total === 0 ? 50 : Math.round((challengerScore / total) * 100)
  const opponentOdds   = 100 - challengerOdds

  async function pickSide(barId: string, side: 'challenger' | 'opponent') {
    setPicking(side)
    setError(null)

    try {
      const res = await fetch(`/api/challenges/${challengeId}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chosen_bar_id:     barId,
          referred_by_code:  referralCode,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')

      const p = data.already_joined ? data.participant : data.participant
      onJoined({
        chosen_bar_id:      p.chosen_bar_id,
        points_contributed: p.points_contributed,
        referral_code:      p.referral_code,
        share_card:         data.share_card,
      })
    } catch (e: any) {
      setError(e.message)
      setPicking(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Trash talk headline */}
      <div style={{
        background:   'rgba(224,49,49,0.08)',
        border:       '1px solid rgba(224,49,49,0.25)',
        borderRadius: 'var(--bw-radius-lg)',
        padding:      '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E24B4A', marginBottom: 8 }}>
          War declared
        </div>
        <div style={{ fontSize: 15, color: 'var(--bw-text)', lineHeight: 1.5, fontStyle: 'italic' }}>
          "{trashTalk}"
        </div>
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 8 }}>
          Stakes: {stakesDescription}
        </div>
      </div>

      {/* Odds */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 8 }}>
          Current odds
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: '#E24B4A', fontWeight: 600 }}>{challenger.name} {challengerOdds}%</span>
          <span style={{ color: '#378ADD', fontWeight: 600 }}>{opponentOdds}% {opponent.name}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bw-border)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${challengerOdds}%`, background: '#E24B4A', transition: 'width 0.6s' }} />
          <div style={{ flex: 1, background: '#378ADD' }} />
        </div>
      </div>

      {/* Pick buttons */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10, textAlign: 'center' }}>
          Pick your side — locked in once chosen
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => pickSide(challenger.id, 'challenger')}
            disabled={!!picking}
            style={{
              flex: 1, padding: '14px 12px',
              background: picking === 'challenger' ? '#E24B4A' : 'rgba(226,75,74,0.12)',
              border: '1px solid #E24B4A',
              borderRadius: 'var(--bw-radius)',
              color: picking === 'challenger' ? '#fff' : '#E24B4A',
              fontWeight: 600, fontSize: 14, cursor: picking ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', opacity: picking && picking !== 'challenger' ? 0.4 : 1,
            }}
          >
            {picking === 'challenger' ? 'Joining…' : challenger.name}
          </button>
          <button
            onClick={() => pickSide(opponent.id, 'opponent')}
            disabled={!!picking}
            style={{
              flex: 1, padding: '14px 12px',
              background: picking === 'opponent' ? '#378ADD' : 'rgba(55,138,221,0.12)',
              border: '1px solid #378ADD',
              borderRadius: 'var(--bw-radius)',
              color: picking === 'opponent' ? '#fff' : '#378ADD',
              fontWeight: 600, fontSize: 14, cursor: picking ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', opacity: picking && picking !== 'opponent' ? 0.4 : 1,
            }}
          >
            {picking === 'opponent' ? 'Joining…' : opponent.name}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center' }}>{error}</div>
      )}
    </div>
  )
}
