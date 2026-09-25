'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Shield, Shirt, Swords } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'

const items = [
  { href: '/',            label: 'Tonight',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: '/turf-wars',   label: 'Turf Wars',   icon: <Swords size={18} /> },
  { href: '/bracelet-hunt', label: 'Hunt',      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
  { href: '/armory',      label: 'Armory',      icon: <Shield size={18} /> },
  { href: '/skins',        label: 'Locker',      icon: <Shirt size={18} /> },
  { href: '/account',     label: 'Account',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
]

export default function BottomNav() {
  const path = usePathname()
  const [hasUnread, setHasUnread] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberships } = await supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', user.id)

      if (!memberships || memberships.length === 0) return

      const channelIds = memberships.map((m: any) => m.channel_id)

      const { data: readStatuses } = await supabase
        .from('channel_read_status')
        .select('channel_id, last_read_at')
        .eq('user_id', user.id)

      const readMap: Record<string, string> = {}
      for (const r of readStatuses ?? []) {
        readMap[r.channel_id] = r.last_read_at
      }

      let total = 0
      for (const chId of channelIds) {
        const lastRead = readMap[chId] ?? '1970-01-01T00:00:00Z'
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', chId)
          .gt('created_at', lastRead)
        total += count ?? 0
      }

      setHasUnread(total > 0)
    })()
  }, [supabase, path])

  return (
    <nav className="nav">
      {items.map(item => (
        <Link key={item.href} href={item.href}
          className={`nav-item ${path === item.href ? 'active' : ''}`}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            {item.icon}
            {item.href === '/' && hasUnread && (
              <span style={{
                position: 'absolute',
                top: -2,
                right: -4,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--bw-red)',
                border: '1.5px solid #0D1117',
              }} />
            )}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
