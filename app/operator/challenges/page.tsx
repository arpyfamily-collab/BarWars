import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export const revalidate = 10

const STATUS_LABELS: Record<string, string> = {
  proposed:         'Proposed',
  opponent_pending: 'Awaiting rival',
  operator_pending: 'Needs approval',
  approved:         'Approved',
  live:             'Live',
  completed:        'Completed',
  cancelled:        'Cancelled',
  forfeit_unpaid:   'Forfeit unpaid',
}

const STATUS_COLORS: Record<string, string> = {
  proposed:         'var(--bw-muted)',
  opponent_pending: 'var(--bw-muted)',
  operator_pending: 'var(--bw-gold)',
  approved:         '#378ADD',
  live:             '#E24B4A',
  completed:        'var(--bw-green)',
  cancelled:        'var(--bw-muted)',
  forfeit_unpaid:   'var(--bw-red)',
}

const ALL_STATUSES = Object.keys(STATUS_LABELS)

export default async function ChallengesListPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const supabase  = createServerSupabaseClient()
  const filter    = searchParams.filter ?? 'operator_pending'
  const statuses  = filter === 'all' ? ALL_STATUSES : [filter]

  const { data: challenges } = await supabase
    .from('bar_challenges')
    .select(`
      id, status, trash_talk, window_start, window_end,
      challenger_score, opponent_score, created_at,
      challenger:venues!challenger_bar_id(name),
      opponent:venues!opponent_bar_id(name)
    `)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(50)

  const filters = [
    { key: 'operator_pending', label: 'Needs approval' },
    { key: 'live',             label: 'Live' },
    { key: 'approved',         label: 'Upcoming' },
    { key: 'completed',        label: 'Completed' },
    { key: 'forfeit_unpaid',   label: 'Forfeit unpaid' },
    { key: 'all',              label: 'All' },
  ]

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em', marginBottom: 24 }}>
        Challenges
      </h1>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <Link key={f.key} href={`/operator/challenges?filter=${f.key}`}>
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

      {/* Challenge rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(challenges ?? []).map((c: any) => {
          const start    = new Date(c.window_start)
          const isLive   = c.status === 'live'
          const isPending = c.status === 'operator_pending'

          return (
            <Link key={c.id} href={`/operator/challenges/${c.id}`}>
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
                      {c.challenger.name} <span style={{ color: 'var(--bw-muted)', fontWeight: 400, fontSize: 13 }}>vs</span> {c.opponent.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      "{c.trash_talk}"
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
                      {STATUS_LABELS[c.status]}
                    </span>
                    {isLive && (
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#E24B4A', letterSpacing: '0.04em' }}>
                        {c.challenger_score} – {c.opponent_score}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}

        {(challenges ?? []).length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--bw-muted)', fontSize: 13 }}>
            No challenges in this category.
          </div>
        )}
      </div>
    </div>
  )
}
