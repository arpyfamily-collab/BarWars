import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import PushNotificationPrompt from '@/components/PushNotificationPrompt'
import BottomNav from '@/components/BottomNav'
import DeleteAccount from '@/components/DeleteAccount'
import BlockedPlayers from '@/components/BlockedPlayers'
import { Shield, ChevronRight, Zap, Sparkles } from 'lucide-react'

export default async function AccountPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
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

        {/* Bar Command Center */}
        <a href="/bar-admin" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid var(--bw-flare)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={20} style={{ color: 'var(--bw-flare)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--bw-text)' }}>BAR COMMAND CENTER</div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Manage flares, bracelet drops, specials, and redemptions</div>
              </div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
          </div>
        </a>

        {/* Push notifications */}
        <PushNotificationPrompt />

        {/* Verification / Anti-Fraud */}
        <a href="/account/verification" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={20} style={{ color: 'var(--bw-gold)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-text)' }}>Verification & Anti-Fraud</div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Device, phone, and .edu verification</div>
              </div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
          </div>
        </a>

        {/* Skin Armory */}
        <a href="/skins" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid var(--bw-violet)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles size={20} style={{ color: 'var(--bw-violet-soft)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-text)' }}>Skin Armory</div>
                <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Status skins, squad identity, deception rentals</div>
              </div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--bw-muted)' }} />
          </div>
        </a>

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

        {/* Delete account */}
        <DeleteAccount />

        {/* Blocked players */}
        <BlockedPlayers userId={user.id} />

        {/* Legal links */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8, fontSize: 12 }}>
          <a href="https://barwars.app/privacy" style={{ color: 'var(--bw-muted)', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="https://barwars.app/terms" style={{ color: 'var(--bw-muted)', textDecoration: 'none' }}>Terms of Service</a>
        </div>

      </div>
      <BottomNav />
    </div>
  )
}
