'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { MessageSquare } from 'lucide-react'

export default function CommsFAB() {
  const [unread, setUnread] = useState(0)
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

      setUnread(total)
    })()
  }, [supabase])

  return (
    <Link
      href="/comms"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 50,
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'var(--bw-violet)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        textDecoration: 'none',
      }}
    >
      <MessageSquare size={20} color="#fff" />
      {unread > 0 && (
        <span style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'var(--bw-red)',
          border: '2px solid #0D1117',
        }} />
      )}
    </Link>
  )
}
