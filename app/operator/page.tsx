import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export const revalidate = 15

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background:   'var(--bw-card)',
      border:       '1px solid var(--bw-border)',
      borderRadius: 12,
      padding:      '20px 24px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 42, letterSpacing: '0.02em', color: color ?? 'var(--bw-text)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default async function OperatorOverview() {
  const supabase = createServerSupabaseClient()

  // Parallel fetches
  const [
    { data: liveChallenges },
    { data: pendingChallenges },
    { data: recentCompleted },
    { data: unpaidForfeits },
    { data: totalVenues },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from('bar_challenges').select(`
      id, challenger_score, opponent_score, window_end,
      challenger:venues!challenger_bar_id(name),
      opponent:venues!opponent_bar_id(name)
    `).eq('status', 'live'),

    supabase.from('bar_challenges').select('id').eq('status', 'operator_pending'),

    supabase.from('bar_challenges').select(`
      id, challenger_score, opponent_score, winner_bar_id, created_at,
      winner:venues!winner_bar_id(name),
      challenger:venues!challenger_bar_id(name),
      opponent:venues!opponent_bar_id(name)
    `).eq('status', 'completed').order('created_at', { ascending: false }).limit(5),

    supabase.from('bar_challenges').select('id, challenger:venues!challenger_bar_id(name), opponent:venues!opponent_bar_id(name), winner_bar_id')
      .eq('status', 'forfeit_unpaid'),

    supabase.from('venues').select('id', { count: 'exact', head: true }),

    supabase.from('challenge_score_events').select('id', { count: 'exact', head: true })
      .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const pendingCount = pendingChallenges?.length ?? 0
  const liveCount    = liveChallenges?.length    ?? 0

  return (
    <div style={{ padding: '40px 48px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em', marginBottom: 4 }}>
          Overview
        </h1>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        <StatCard label="Pending approval" value={pendingCount} sub="awaiting your review" color={pendingCount > 0 ? 'var(--bw-gold)' : undefined} />
        <StatCard label="Live battles"     value={liveCount}    sub="happening right now"  color={liveCount > 0 ? '#E24B4A' : undefined} />
        <StatCard label="Score events"     value={(recentEvents as any)?.count ?? 0}  sub="last 24 hours" />
        <StatCard label="Forfeit unpaid"   value={unpaidForfeits?.length ?? 0} sub="past deadline" color={unpaidForfeits?.length ? 'var(--bw-red)' : undefined} />
      </div>

      {/* Pending approvals — always first if any */}
      {pendingCount > 0 && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>
              Needs your approval
            </h2>
            <span style={{ background: 'rgba(245,184,0,0.15)', color: 'var(--bw-gold)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.06em' }}>
              {pendingCount} pending
            </span>
          </div>
          <Link href="/operator/challenges?filter=operator_pending">
            <div style={{
              background:   'rgba(245,184,0,0.06)',
              border:       '1px solid rgba(245,184,0,0.3)',
              borderRadius: 12,
              padding:      '16px 20px',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, color: 'var(--bw-text)' }}>
                {pendingCount} challenge{pendingCount !== 1 ? 's' : ''} waiting for operator review
              </span>
              <span style={{ fontSize: 13, color: 'var(--bw-gold)' }}>Review now →</span>
            </div>
          </Link>
        </div>
      )}

      {/* Live battles */}
      {(liveChallenges?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 16 }}>
            Live right now
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liveChallenges!.map((c: any) => {
              const total    = c.challenger_score + c.opponent_score
              const pct      = total === 0 ? 50 : Math.round((c.challenger_score / total) * 100)
              const minsLeft = Math.max(0, Math.floor((new Date(c.window_end).getTime() - Date.now()) / 60_000))

              return (
                <Link key={c.id} href={`/operator/challenges/${c.id}`}>
                  <div style={{
                    background:   'var(--bw-card)',
                    border:       '1px solid rgba(224,49,49,0.3)',
                    borderRadius: 12,
                    padding:      '16px 20px',
                    cursor:       'pointer',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {c.challenger.name} <span style={{ color: 'var(--bw-muted)', fontWeight: 400 }}>vs</span> {c.opponent.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#E24B4A' }}>
                          {c.challenger_score} – {c.opponent_score}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{minsLeft}m left</span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bw-border)', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${pct}%`, background: '#E24B4A', transition: 'width 0.6s' }} />
                      <div style={{ flex: 1, background: '#378ADD' }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Forfeit unpaid */}
      {(unpaidForfeits?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 16, color: 'var(--bw-red)' }}>
            Forfeits unpaid
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unpaidForfeits!.map((c: any) => {
              const loser = c.winner_bar_id === c.challenger?.id ? c.opponent : c.challenger
              return (
                <Link key={c.id} href={`/operator/challenges/${c.id}`}>
                  <div style={{
                    background:   'rgba(224,49,49,0.06)',
                    border:       '1px solid rgba(224,49,49,0.3)',
                    borderRadius: 10,
                    padding:      '12px 16px',
                    display:      'flex',
                    justifyContent: 'space-between',
                    alignItems:   'center',
                    cursor:       'pointer',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--bw-text)' }}>
                      {loser?.name ?? 'Unknown bar'} — forfeit overdue
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--bw-red)' }}>Review →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent completed */}
      {(recentCompleted?.length ?? 0) > 0 && (
        <div>
          <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 16 }}>
            Recent results
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentCompleted!.map((c: any) => (
              <Link key={c.id} href={`/operator/challenges/${c.id}`}>
                <div style={{
                  background:   'var(--bw-card)',
                  border:       '1px solid var(--bw-border)',
                  borderRadius: 10,
                  padding:      '12px 16px',
                  display:      'flex',
                  justifyContent: 'space-between',
                  alignItems:   'center',
                  cursor:       'pointer',
                }}>
                  <div style={{ fontSize: 13, color: 'var(--bw-text)' }}>
                    {c.challenger.name} vs {c.opponent.name}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--bw-green)', fontWeight: 600 }}>
                      {c.winner?.name} won
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                      {c.challenger_score} – {c.opponent_score}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
