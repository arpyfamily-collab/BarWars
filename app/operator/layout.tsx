import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

const NAV = [
  { href: '/operator',             label: 'Overview',    icon: '⚡' },
  { href: '/operator/challenges',  label: 'Challenges',  icon: '⚔️' },
  { href: '/operator/venues',      label: 'Venues',      icon: '🏛️' },
  { href: '/operator/nominations', label: 'Nominations', icon: '🎯' },
]

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bw-black)' }}>
      {/* Sidebar */}
      <aside style={{
        width:          240,
        flexShrink:     0,
        background:     'var(--bw-surface)',
        borderRight:    '1px solid var(--bw-border)',
        display:        'flex',
        flexDirection:  'column',
        padding:        '32px 0',
        position:       'sticky',
        top:            0,
        height:         '100dvh',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 24px 32px' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.06em', color: 'var(--bw-gold)' }}>
            BarWars
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
            Operator console
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           10,
                padding:       '10px 12px',
                borderRadius:  8,
                fontSize:      14,
                color:         'var(--bw-muted)',
                fontWeight:    500,
                transition:    'background 0.15s, color 0.15s',
              }}
              className="op-nav-item"
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: '24px', borderTop: '1px solid var(--bw-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{user.email}</div>
          <Link href="/api/auth/logout" style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4, display: 'block' }}>
            Sign out →
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {children}
      </main>

      <style>{`
        .op-nav-item:hover { background: rgba(255,255,255,0.05); color: var(--bw-text) !important; }
      `}</style>
    </div>
  )
}
