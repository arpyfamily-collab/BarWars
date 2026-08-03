'use client'
/**
 * BattleBar
 *
 * The core visual: two bar logos on either side of an animated
 * horizontal fill that shifts left/right as scores change.
 * Pulses gold when the lead flips.
 */

import { useEffect, useRef, useState } from 'react'
import type { ChallengeBar } from '@/hooks/useChallengeLive'

interface Props {
  challenger:       ChallengeBar
  opponent:         ChallengeBar
  challengerScore:  number
  opponentScore:    number
  prevLeader:       string | null
  didFlip:          boolean
}

export default function BattleBar({
  challenger, opponent,
  challengerScore, opponentScore,
  prevLeader, didFlip,
}: Props) {
  const total    = challengerScore + opponentScore
  const pct      = total === 0 ? 50 : Math.round((challengerScore / total) * 100)
  const isTied   = challengerScore === opponentScore

  const [flash, setFlash] = useState(false)
  const prevPct = useRef(50)

  // Flash gold on lead flip
  useEffect(() => {
    if (didFlip) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [didFlip])

  // Smooth transition: only animate after first render
  useEffect(() => { prevPct.current = pct }, [pct])

  const lead     = Math.abs(challengerScore - opponentScore)
  const leader   = challengerScore > opponentScore ? challenger
                 : opponentScore > challengerScore ? opponent
                 : null

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Score numbers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 52,
            lineHeight: 1,
            color: challengerScore >= opponentScore ? '#E24B4A' : 'var(--bw-muted)',
            transition: 'color 0.4s',
            letterSpacing: '0.02em',
          }}>
            {challengerScore}
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', fontWeight: 600, marginTop: 2 }}>
            {challenger.name}
          </div>
        </div>

        {/* Centre: tied / lead indicator */}
        <div style={{ textAlign: 'center', padding: '0 12px' }}>
          {isTied ? (
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, color: 'var(--bw-gold)', letterSpacing: '0.08em' }}>
              TIED
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 18,
                color: flash ? 'var(--bw-gold)' : 'var(--bw-muted)',
                letterSpacing: '0.06em',
                transition: 'color 0.3s',
              }}>
                +{lead}
              </div>
              <div style={{ fontSize: 10, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {leader?.name.split(' ')[0]} leads
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 52,
            lineHeight: 1,
            color: opponentScore > challengerScore ? '#378ADD' : 'var(--bw-muted)',
            transition: 'color 0.4s',
            letterSpacing: '0.02em',
          }}>
            {opponentScore}
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', fontWeight: 600, marginTop: 2 }}>
            {opponent.name}
          </div>
        </div>
      </div>

      {/* The battle bar */}
      <div style={{
        height: 14,
        borderRadius: 7,
        background: 'var(--bw-border)',
        overflow: 'hidden',
        display: 'flex',
        boxShadow: flash ? '0 0 0 2px var(--bw-gold)' : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        <div style={{
          width:      `${pct}%`,
          background: '#E24B4A',
          transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          borderRadius: '7px 0 0 7px',
        }} />
        <div style={{
          flex:       1,
          background: '#378ADD',
          borderRadius: '0 7px 7px 0',
        }} />
      </div>

      {/* Participant count row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ fontSize: 11, color: '#E24B4A99' }}>
          {pct}%
        </div>
        <div style={{ fontSize: 11, color: '#378ADD99' }}>
          {100 - pct}%
        </div>
      </div>
    </div>
  )
}
