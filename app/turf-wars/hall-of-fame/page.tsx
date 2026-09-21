'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Trophy, Flame, Shield, Crosshair, Swords, TrendingUp } from 'lucide-react'

interface HallOfFameEntry {
  id: string
  name: string
  org_type: string
  turf_wins: number
  turf_losses: number
  current_streak: number
  longest_streak: number
  wars_won: number
  wars_lost: number
  sneak_attacks_launched: number
  sneak_attacks_repelled: number
  shots_fired_count: number
  shots_followed_through: number
  follow_through_rate: number | null
  cred_fired: number
  cred_followed: number
  cred_stood_down: number
  fame_score: number
}

export default function HallOfFamePage() {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/turf-wars/hall-of-fame')
      .then(r => r.json())
      .then(d => { setEntries(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontSize: 12, color: 'var(--bw-muted)', cursor: 'pointer', marginBottom: 12 }} onClick={() => history.back()}>← Turf Wars</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={24} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Hall of Fame</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>All-time greatest turf war legends.</div>
      </div>

      <div className="page-content">
        {entries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--bw-muted)', fontSize: 13 }}>
            <Trophy size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            No hall of fame entries yet. Win some turf wars to appear here.
          </div>
        ) : (
          <div className="stack stack-sm">
            {entries.map((org, i) => (
              <div key={org.id} className="card" style={{ borderLeft: i < 3 ? `3px solid ${i === 0 ? 'var(--bw-gold)' : i === 1 ? '#C0C0C0' : '#CD7F32'}` : 'var(--bw-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    fontFamily: 'Bebas Neue, sans-serif',
                    fontSize: 24,
                    color: i === 0 ? 'var(--bw-gold)' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--bw-muted)',
                    minWidth: 28,
                  }}>
                    #{i + 1}
                  </div>
                  <span style={{ fontSize: 18 }}>{org.org_type === 'fraternity' ? '♂' : '♀'}</span>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>{org.name}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: 'var(--bw-gold)' }}>
                    {org.fame_score} pts
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {org.longest_streak > 0 && (
                    <Stat icon={Flame} label="Longest Hold" value={`${org.longest_streak}w`} color="var(--bw-gold)" />
                  )}
                  {org.turf_wins > 0 && (
                    <Stat icon={Shield} label="Turf Wins" value={org.turf_wins} color="var(--bw-green)" />
                  )}
                  {org.wars_won > 0 && (
                    <Stat icon={Swords} label="Wars Won" value={org.wars_won} color="#E03131" />
                  )}
                  {org.sneak_attacks_repelled > 0 && (
                    <Stat icon={Crosshair} label="Attacks Repelled" value={org.sneak_attacks_repelled} color="#378ADD" />
                  )}
                  {org.follow_through_rate !== null && (
                    <Stat icon={TrendingUp} label="Follow-Through" value={`${org.follow_through_rate}%`} color="var(--bw-text)" />
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--bw-muted)' }}>
                  <span>{org.turf_wins}W / {org.turf_losses}L</span>
                  {org.wars_lost > 0 && <span>{org.wars_won}W / {org.wars_lost}L wars</span>}
                  {org.current_streak > 0 && (
                    <span style={{ color: 'var(--bw-gold)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Flame size={11} />{org.current_streak}w current
                    </span>
                  )}
                  {org.cred_fired > 0 && (
                    <span title="Credibility ledger">
                      {org.cred_fired} fired · {org.cred_followed} followed · {org.cred_stood_down} stood down
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof Trophy; label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <Icon size={13} style={{ color }} />
      <span style={{ color: 'var(--bw-muted)' }}>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  )
}
