import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'
import SignOutButton from './_signout'

export const metadata = {
  title: 'Bar Command Center — BarWars',
}

export default async function BarAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/bar-admin')

  const { data: memberships } = await supabase
    .from('bar_admins')
    .select('bar_id, is_bar_asset, venues:bar_id ( id, name )')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) {
    redirect('/?err=not_bar_admin')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0C', color: '#F5F5F5' }}>
      <header
        style={{
          borderBottom: '1px solid rgba(201,168,76,0.2)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(10,10,12,0.95)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 800,
              letterSpacing: '0.15em',
              fontSize: 14,
              color: '#C9A84C',
            }}
          >
            BARWARS
          </div>
          <nav style={{ display: 'flex', gap: 24, fontSize: 13, letterSpacing: '0.1em' }}>
            <Link
              href="/bar-admin"
              style={{ color: '#F5F5F5', textDecoration: 'none', textTransform: 'uppercase' }}
            >
              Command Center
            </Link>
            <Link
              href="/dashboard/scanner"
              style={{ color: '#9CA3AF', textDecoration: 'none', textTransform: 'uppercase' }}
            >
              Scanner
            </Link>
            <Link
              href="/dashboard/turf"
              style={{ color: '#9CA3AF', textDecoration: 'none', textTransform: 'uppercase' }}
            >
              Turf Wars
            </Link>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <span style={{ color: '#9CA3AF' }}>{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
