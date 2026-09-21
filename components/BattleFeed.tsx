'use client'

import { useEffect, useState } from 'react'
import { Flame, Trophy, Crosshair, Shield, Zap, Flag, Bell, Activity } from 'lucide-react'

interface FeedEvent {
  id: string
  event_type: string
  bar_name: string
  org_name: string | null
  rival_org_name: string | null
  created_at: string
}

interface LeaderboardEntry {
  org_id: string
  org_name: string
  org_type: string
  war_score: number
  bars_held: number
  rank: number
}

const EVENT_CONFIG: Record<string, { icon: typeof Flame; color: string; label: (e: FeedEvent) => string }> = {
  shots_fired: {
    icon: Flame, color: '#E03131',
    label: e => `${e.org_name} fired shots at ${e.bar_name}`,
  },
  sneak_attack_detected: {
    icon: Crosshair, color: '#E03131',
    label: e => `${e.org_name} launched a sneak attack on ${e.bar_name}`,
  },
  claim_announced: {
    icon: Flag, color: '#2ECC71',
    label: e => `${e.org_name} announced a claim on ${e.bar_name}`,
  },
  war_declared: {
    icon: Zap, color: '#F5B800',
    label: e => `${e.org_name} declared war at ${e.bar_name}`,
  },
  turf_lost: {
    icon: Flag, color: '#C9A84C',
    label: e => `${e.org_name} lost turf at ${e.bar_name}`,
  },
  turf_defended: {
    icon: Shield, color: '#2ECC71',
    label: e => `${e.org_name} defended turf at ${e.bar_name}`,
  },
  rally_called: {
    icon: Bell, color: '#F5B800',
    label: e => `${e.org_name} called a rally at ${e.bar_name}`,
  },
  maintenance_missed: {
    icon: Activity, color: '#E03131',
    label: e => `${e.org_name} missed maintenance at ${e.bar_name}`,
  },
  maintenance_warning: {
    icon: Activity, color: '#F5B800',
    label: e => `${e.org_name} has a maintenance warning at ${e.bar_name}`,
  },
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function FeedTab() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/turf-wars/feed')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEvents(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ fontSize: 13, color: 'var(--bw-muted)', padding: '16px 0' }}>Loading feed…</div>

  if (events.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🕊️</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>The battlefield is quiet for now.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map(event => {
        const cfg = EVENT_CONFIG[event.event_type]
        if (!cfg) return null
        const Icon = cfg.icon
        return (
          <div key={event.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            background: '#0D1117', borderRadius: 10, padding: '12px 14px',
            border: '1px solid #1A2030',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={15} style={{ color: cfg.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#F0F0F0', lineHeight: 1.4 }}>
                {cfg.label(event)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 3 }}>
                {timeAgo(event.created_at)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StandingsTab() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/turf-wars/leaderboard')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEntries(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ fontSize: 13, color: 'var(--bw-muted)', padding: '16px 0' }}>Loading standings…</div>

  if (entries.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🏆</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>No orgs on the board yet.</div>
      </div>
    )
  }

  const rankColors: Record<number, string> = { 1: '#C9A84C', 2: '#8B9BB4', 3: '#CD7F32' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(entry => (
        <div key={entry.org_id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: entry.rank === 1 ? 'rgba(201,168,76,0.06)' : '#0D1117',
          border: `1px solid ${entry.rank === 1 ? 'rgba(201,168,76,0.25)' : '#1A2030'}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: rankColors[entry.rank] ? `${rankColors[entry.rank]}20` : '#161B27',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900,
            color: rankColors[entry.rank] ?? 'var(--bw-muted)',
          }}>
            {entry.rank === 1 ? '👑' : `#${entry.rank}`}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F0F0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{entry.org_type === 'fraternity' ? '♂' : '♀'}</span>
              {entry.org_name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 2 }}>
              {entry.bars_held} bar{entry.bars_held !== 1 ? 's' : ''} held
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', lineHeight: 1,
              color: rankColors[entry.rank] ?? '#F0F0F0',
            }}>
              {entry.war_score}
            </div>
            <div style={{ fontSize: 9, color: 'var(--bw-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              war pts
            </div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 10, color: '#2A3350', textAlign: 'center', paddingTop: 4 }}>
        Rolling 7-day standings · Resets Monday midnight CT
      </div>
    </div>
  )
}

export default function BattleFeed() {
  const [tab, setTab] = useState<'feed' | 'standings'>('feed')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0',
    background: active ? '#161B27' : 'transparent',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--bw-gold)' : 'transparent'}`,
    color: active ? '#F0F0F0' : 'var(--bw-muted)',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer', transition: 'all 0.15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  })

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #1A2030', marginBottom: 14 }}>
        <button style={tabStyle(tab === 'feed')} onClick={() => setTab('feed')}>
          <Flame size={12} /> Battle Feed
        </button>
        <button style={tabStyle(tab === 'standings')} onClick={() => setTab('standings')}>
          <Trophy size={12} /> Standings
        </button>
      </div>

      {tab === 'feed'      && <FeedTab />}
      {tab === 'standings' && <StandingsTab />}
    </div>
  )
}
