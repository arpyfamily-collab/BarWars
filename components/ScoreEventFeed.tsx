'use client'
/**
 * ScoreEventFeed
 *
 * Live-updating list of score events. New entries slide in from the top.
 * Each row shows bar colour, event type label, points, and relative time.
 */

import { useEffect, useRef } from 'react'
import type { ScoreEvent } from '@/hooks/useChallengeLive'

const EVENT_LABELS: Record<string, string> = {
  checkin:          'Checked in',
  pass_purchase:    'Pass purchased',
  room_upgrade:     'Room upgrade',
  drink_purchase:   'Drink',
  referral_checkin: 'Brought a friend',
}

const EVENT_ICONS: Record<string, string> = {
  checkin:          '📍',
  pass_purchase:    '🎟️',
  room_upgrade:     '⬆️',
  drink_purchase:   '🍺',
  referral_checkin: '👥',
}

function relativeTime(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

interface Props {
  events:           ScoreEvent[]
  challengerBarId:  string
  opponentBarId:    string
}

export default function ScoreEventFeed({ events, challengerBarId, opponentBarId }: Props) {
  const prevLength = useRef(events.length)
  const listRef    = useRef<HTMLDivElement>(null)

  // Flash top item when a new event comes in
  useEffect(() => {
    if (events.length > prevLength.current && listRef.current) {
      const first = listRef.current.firstElementChild as HTMLElement | null
      if (first) {
        first.style.background = 'rgba(245,184,0,0.12)'
        setTimeout(() => { first.style.background = '' }, 800)
      }
    }
    prevLength.current = events.length
  }, [events.length])

  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--bw-muted)', fontSize: 13 }}>
        Activity will appear here once the battle starts
      </div>
    )
  }

  return (
    <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {events.map((e, i) => {
        const isChallenger = e.bar_id === challengerBarId
        const barColor     = isChallenger ? '#E24B4A' : '#378ADD'

        return (
          <div
            key={e.id}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '8px 12px',
              borderRadius:   6,
              background:     i === 0 ? 'var(--bw-card)' : 'transparent',
              transition:     'background 0.8s ease',
              gap:            10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {EVENT_ICONS[e.event_type] ?? '⚡'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--bw-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.patron_name
                    ? <><span style={{ fontWeight: 600 }}>{e.patron_name.split(' ')[0]}</span> {EVENT_LABELS[e.event_type] ?? e.event_type}</>
                    : EVENT_LABELS[e.event_type] ?? e.event_type
                  }
                </div>
                <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 1 }}>
                  {relativeTime(e.occurred_at)}
                </div>
              </div>
            </div>

            <div style={{
              fontFamily:    'Bebas Neue, sans-serif',
              fontSize:      18,
              color:         barColor,
              letterSpacing: '0.04em',
              flexShrink:    0,
            }}>
              +{e.points}
            </div>
          </div>
        )
      })}
    </div>
  )
}
