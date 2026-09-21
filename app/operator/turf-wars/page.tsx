import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  pending:          'Pending',
  operator_pending: 'Needs approval',
  live:             'Live',
  successful:       'Successful',
  failed:           'Failed',
  contested:        'Contested',
  cancelled:        'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  pending:          'var(--bw-muted)',
  operator_pending: 'var(--bw-gold)',
  live:             '#E24B4A',
  successful:       'var(--bw-green)',
  failed:           'var(--bw-red)',
  contested:        'var(--bw-gold)',
  cancelled:        'var(--bw-muted)',
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  initial_claim:   'Initial Claim',
  sneak_attack:    'Sneak Attack',
  war_declaration: 'War Declaration',
}

const ALL_STATUSES = Object.keys(STATUS_LABELS)

export default async function TurfWarsListPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const supabase = createServerSupabaseClient()
  const filter   = searchParams.filter ?? 'operator_pending'
  const statuses = filter === 'all' ? ALL_STATUSES : [filter]

  const { data: claims } = await supabase
    .from('turf_claims')
    .select(`
      id, claim_type, status, window_open_at, window_close_at,
      required_headcount, attacker_verified_headcount, defender_verified_headcount,
      detected_at, created_at,
      attacking_org:greek_orgs!attacking_org_id(name, org_type),
      defending_org:greek_orgs!defending_org_id(name, org_type),
      bar:venues(name)
    `)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: leaderboard } = await supabase
    .from('turf_leaderboard')
    .select('*')
    .limit(10)

  const filters = [
    { key: 'operator_pending', label: 'Needs approval' },
    { key: 'live',             label: 'Live' },
    { key: 'pending',          label: 'Pending' },
    { key: 'successful',       label: 'Successful' },
    { key: 'failed',           label: 'Failed' },
    { key: 'contested',        label: 'Contested' },
    { key: 'all',              label: 'All' },
  ]

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em', marginBottom: 24 }}>
        Turf Wars
      </h1>

      {/* Turf leaderboard snapshot */}
      {(leaderboard ?? []).length > 0 && (
        <div style={{
          background: 'var(--bw-card)',
          border: '1px solid var(--bw-border)',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Current standings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(leaderboard ?? []).slice(0, 5).map((org: any) => (
              <div key={org.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{org.org_type === 'fraternity' ? '♂' : '♀'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--bw-text)' }}>{org.name}</span>
                  {org.home_turf_bar_name && (
                    <span style={{ fontSize: 11, color: 'var(--bw-gold)' }}>@ {org.home_turf_bar_name}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--bw-muted)' }}>
                  <span>{org.turf_wins}W</span>
                  <span>{org.turf_losses}L</span>
                  {org.turf_streak_weeks > 0 && (
                    <span style={{ color: 'var(--bw-gold)' }}>{org.turf_streak_weeks}w streak</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <Link key={f.key} href={`/operator/turf-wars?filter=${f.key}`}>
            <div style={{
              padding:      '6px 14px',
              borderRadius: 20,
              fontSize:     13,
              fontWeight:   500,
              cursor:       'pointer',
              background:   filter === f.key ? 'var(--bw-gold)' : 'var(--bw-card)',
              color:        filter === f.key ? 'var(--bw-black)' : 'var(--bw-muted)',
              border:       `1px solid ${filter === f.key ? 'var(--bw-gold)' : 'var(--bw-border)'}`,
              transition:   'all 0.15s',
            }}>
              {f.label}
            </div>
          </Link>
        ))}
      </div>

      {/* Claim rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(claims ?? []).map((c: any) => {
          const start    = new Date(c.window_open_at)
          const isLive   = c.status === 'live'
          const isPending = c.status === 'operator_pending'
          const attackerName = c.attacking_org?.name ?? 'Unknown'
          const defenderName = c.defending_org?.name ?? 'Neutral'
          const barName = c.bar?.name ?? 'Unknown'

          return (
            <Link key={c.id} href={`/operator/turf-wars/${c.id}`}>
              <div style={{
                background:   'var(--bw-card)',
                border:       `1px solid ${isPending ? 'rgba(245,184,0,0.35)' : isLive ? 'rgba(224,49,49,0.3)' : 'var(--bw-border)'}`,
                borderRadius: 12,
                padding:      '16px 20px',
                cursor:       'pointer',
                transition:   'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                      {CLAIM_TYPE_LABELS[c.claim_type] ?? c.claim_type}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--bw-text)', marginBottom: 4 }}>
                      {attackerName} <span style={{ color: 'var(--bw-muted)', fontWeight: 400 }}>vs</span> {defenderName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 6 }}>
                      {barName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                      {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                      {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize:     11,
                      fontWeight:   700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color:        STATUS_COLORS[c.status],
                      padding:      '3px 8px',
                      borderRadius: 20,
                      background:   `${STATUS_COLORS[c.status]}18`,
                      whiteSpace:   'nowrap',
                    }}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                    {isLive && (
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#E24B4A', letterSpacing: '0.04em' }}>
                        {c.attacker_verified_headcount} – {c.defender_verified_headcount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}

        {(claims ?? []).length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--bw-muted)', fontSize: 13 }}>
            No turf claims in this category.
          </div>
        )}
      </div>
    </div>
  )
}
