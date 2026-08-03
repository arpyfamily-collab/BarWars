import { createServerSupabaseClient } from '@/lib/supabase'

export const revalidate = 60

export default async function OperatorNominationsPage() {
  const supabase = createServerSupabaseClient()

  const { data: nominations } = await supabase
    .from('nomination_leaderboard')
    .select(`
      nomination_count, total_jackpot_cents, last_nominated_at, challenge_exists,
      challenger:venues!challenger_bar_id(id, name),
      opponent:venues!opponent_bar_id(id, name)
    `)
    .limit(25)

  return (
    <div style={{ padding: '40px 48px', maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em', marginBottom: 6 }}>
          Grudge match nominations
        </h1>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
          Patron-driven matchups ranked by jackpot. Use this to decide which challenges to encourage bar admins to propose.
        </div>
      </div>

      {(nominations ?? []).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--bw-muted)', fontSize: 13 }}>
          No nominations yet. Patrons pay $2 to nominate a matchup — the jackpot builds until the war happens.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(nominations ?? []).map((n: any, i: number) => {
            const jackpot      = (n.total_jackpot_cents / 100).toFixed(2)
            const lastNominated = new Date(n.last_nominated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div key={i} style={{
                background:   'var(--bw-card)',
                border:       `1px solid ${n.nomination_count >= 10 ? 'rgba(245,184,0,0.35)' : 'var(--bw-border)'}`,
                borderRadius: 12,
                padding:      '16px 20px',
                display:      'flex',
                justifyContent: 'space-between',
                alignItems:   'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: 'var(--bw-muted)', width: 24 }}>
                      #{i + 1}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      {n.challenger?.name} <span style={{ color: 'var(--bw-muted)', fontWeight: 400, fontSize: 13 }}>vs</span> {n.opponent?.name}
                    </span>
                    {n.challenge_exists && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-green)', background: 'rgba(46,204,113,0.12)', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Challenge exists
                      </span>
                    )}
                    {n.nomination_count >= 10 && !n.challenge_exists && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-gold)', background: 'rgba(245,184,0,0.12)', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Hot
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginLeft: 34 }}>
                    {n.nomination_count} nomination{n.nomination_count !== 1 ? 's' : ''} · Last: {lastNominated}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: 'Bebas Neue, sans-serif',
                    fontSize:   28,
                    color:      'var(--bw-gold)',
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                  }}>
                    ${jackpot}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 2 }}>jackpot</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 12, fontSize: 13, color: 'var(--bw-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--bw-text)' }}>How jackpots work:</strong> When a nominated challenge actually runs and the winner is declared, the jackpot is split — 50% to winning-side nominators, 50% to the house. Nominators who picked the winning bar earn back their $2 plus a share. Distribution is manual until the payout API is built.
      </div>
    </div>
  )
}
