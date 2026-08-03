import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import PushNotificationPrompt from '@/components/PushNotificationPrompt'
import BottomNav from '@/components/BottomNav'

export default async function AccountPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .single()

  const { data: sub } = await supabase
    .from('library_card_subscriptions')
    .select('status, passes_remaining_this_month, billing_paused')
    .eq('user_id', user.id)
    .single()

  const { data: badges } = await supabase
    .from('veteran_badges')
    .select('badge_name, won, awarded_at, bar:venues!veteran_badges_bar_id_fkey(name)')
    .eq('user_id', user.id)
    .order('awarded_at', { ascending: false })
    .limit(10)

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          {(profile as any)?.full_name ?? 'My account'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>{user.email}</div>
      </div>

      <div className="page-content">

        {/* Library Card status */}
        {sub && (
          <div className="card" style={{ borderColor: 'rgba(245,184,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em', color: 'var(--bw-gold)' }}>
                  Library Card
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 2 }}>
                  {(sub as any).billing_paused ? 'Summer mode — billing paused' : 'Active'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--bw-gold)', lineHeight: 1 }}>
                  {(sub as any).passes_remaining_this_month}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>passes left</div>
              </div>
            </div>
          </div>
        )}

        {/* Push notifications */}
        <PushNotificationPrompt />

        {/* Veteran badges */}
        {(badges ?? []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
              Battle badges
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(badges ?? []).map((b: any, i: number) => (
                <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 20 }}>{b.won ? '🎖️' : '🛡️'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-text)' }}>{b.badge_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>{b.bar?.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: b.won ? 'var(--bw-green)' : 'var(--bw-muted)', fontWeight: 600 }}>
                    {b.won ? 'Won' : 'Fought'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sign out */}
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="btn btn-ghost" style={{ fontSize: 14, color: 'var(--bw-muted)' }}>
            Sign out
          </button>
        </form>

      </div>
      <BottomNav />
    </div>
  )
}
