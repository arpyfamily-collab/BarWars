'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/BottomNav'
import { MessageSquare, Megaphone, Eye, Swords, Users, Radio, ArrowLeft } from 'lucide-react'

interface ChannelWithMeta {
  id: string
  name: string
  channel_type: string
  org_id: string | null
  venue_id: string | null
  is_active: boolean
  member_count: number
  last_message_content: string | null
  last_message_at: string | null
  unread_count: number
  is_live: boolean
}

interface MockChannel {
  id: string
  name: string
  channel_type: string
  member_count: number
  last_message_content: string
  last_message_at: string
  unread_count: number
  is_live: boolean
  is_mock: true
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  war_room:   { label: 'War Room',   color: 'var(--bw-violet)', icon: <Swords size={16} /> },
  hessian:    { label: 'Hessian',    color: 'var(--bw-cyan)',   icon: <Users size={16} /> },
  battlefield:{ label: 'Battlefield',color: 'var(--bw-red)',    icon: <Radio size={16} /> },
  direct:     { label: 'Direct',     color: 'var(--bw-muted)',  icon: <MessageSquare size={16} /> },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default function CommsPage() {
  const router = useRouter()
  const [warRooms, setWarRooms] = useState<ChannelWithMeta[]>([])
  const [hessians, setHessians] = useState<ChannelWithMeta[]>([])
  const [battlefields, setBattlefields] = useState<ChannelWithMeta[]>([])
  const [directs, setDirects] = useState<ChannelWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [showMock, setShowMock] = useState(false)
  const supabase = createClient()

  const fetchChannels = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: memberships } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    const memberChannelIds = (memberships ?? []).map((m: any) => m.channel_id)

    let userChannels: any[] = []
    if (memberChannelIds.length > 0) {
      const { data } = await supabase
        .from('channels')
        .select('*')
        .in('id', memberChannelIds)
      userChannels = data ?? []
    }

    const { data: battlefieldChannels } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_type', 'battlefield')
      .eq('is_active', true)

    const allChannels = [...userChannels, ...(battlefieldChannels ?? [])]
    const seen = new Set<string>()
    const unique = allChannels.filter((c: any) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })

    const { data: readStatuses } = await supabase
      .from('channel_read_status')
      .select('channel_id, last_read_at')
      .eq('user_id', user.id)

    const readMap: Record<string, string> = {}
    for (const r of readStatuses ?? []) {
      readMap[r.channel_id] = r.last_read_at
    }

    const enriched: ChannelWithMeta[] = []
    for (const ch of unique) {
      const { count: memberCount } = await supabase
        .from('channel_members')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', ch.id)

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('channel_id', ch.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let unread = 0
      if (lastMsg) {
        const lastRead = readMap[ch.id]
        if (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead)) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('channel_id', ch.id)
            .gt('created_at', lastRead ?? '1970-01-01T00:00:00Z')
          unread = count ?? 0
        }
      }

      enriched.push({
        id: ch.id,
        name: ch.name,
        channel_type: ch.channel_type,
        org_id: ch.org_id,
        venue_id: ch.venue_id,
        is_active: ch.is_active,
        member_count: memberCount ?? 0,
        last_message_content: lastMsg?.content ?? null,
        last_message_at: lastMsg?.created_at ?? null,
        unread_count: unread,
        is_live: ch.channel_type === 'battlefield' && ch.is_active,
      })
    }

    setWarRooms(enriched.filter(c => c.channel_type === 'war_room'))
    setHessians(enriched.filter(c => c.channel_type === 'hessian'))
    setBattlefields(enriched.filter(c => c.channel_type === 'battlefield'))
    setDirects(enriched.filter(c => c.channel_type === 'direct'))

    const hasAny = enriched.length > 0
    setShowMock(!hasAny)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const mockWarRooms: MockChannel[] = [
    { id: 'mock-wr-1', name: 'Kappa Manor War Room', channel_type: 'war_room', member_count: 45, last_message_content: 'Alpha House just posted up at Funky\'s — intel confirmed', last_message_at: new Date(Date.now() - 120000).toISOString(), unread_count: 2, is_live: false, is_mock: true },
  ]
  const mockBattlefields: MockChannel[] = [
    { id: 'mock-bf-1', name: 'The Library — Live Battle', channel_type: 'battlefield', member_count: 128, last_message_content: 'The Cabana talking big but they\'re 20 deep at best', last_message_at: new Date(Date.now() - 60000).toISOString(), unread_count: 5, is_live: true, is_mock: true },
  ]

  const renderChannelCard = (ch: ChannelWithMeta | MockChannel, accentColor: string) => {
    const cfg = TYPE_CONFIG[ch.channel_type] ?? TYPE_CONFIG.direct
    const isMock = (ch as MockChannel).is_mock

    return (
      <div
        key={ch.id}
        onClick={() => isMock ? null : router.push(`/comms/${ch.id}`)}
        className="card"
        style={{
          cursor: isMock ? 'default' : 'pointer',
          padding: '14px 16px',
          borderLeft: `3px solid ${accentColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            {cfg.icon}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bw-text)' }}>{ch.name}</span>
            {ch.is_live && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: 'var(--bw-red)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bw-red)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                LIVE
              </span>
            )}
            {isMock && (
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--bw-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 8 }}>
                DEMO
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{ch.member_count} members</span>
            {ch.last_message_content && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {truncate(ch.last_message_content, 40)}
                </span>
                {ch.last_message_at && <span style={{ opacity: 0.4 }}>· {timeAgo(ch.last_message_at)}</span>}
              </>
            )}
          </div>
        </div>
        {ch.unread_count > 0 && (
          <div style={{
            flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10,
            background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
          }}>
            {ch.unread_count}
          </div>
        )}
      </div>
    )
  }

  const renderSection = (title: string, accentColor: string, channels: (ChannelWithMeta | MockChannel)[], emptyMsg: string, mockChannels?: MockChannel[]) => {
    const showMockSection = showMock && mockChannels && mockChannels.length > 0 && channels.length === 0
    const items = channels.length > 0 ? channels : (showMockSection ? mockChannels! : [])

    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: accentColor, marginBottom: 8,
        }}>
          {title}
        </div>
        {items.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {items.map(ch => renderChannelCard(ch, accentColor))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 20, padding: '10px 0' }}>
            {emptyMsg}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: 'var(--bw-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
            WAR COMMS
          </div>
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 2 }}>
            Coordinate. Strategize. Talk trash.
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', padding: '20px 0' }}>
            Loading channels…
          </div>
        ) : (
          <>
            {renderSection('Your War Rooms', 'var(--bw-violet)', warRooms, 'Join a Greek org to access your War Room', mockWarRooms)}
            {renderSection('Hessian Comms', 'var(--bw-cyan)', hessians, 'Form or join a Hessian Company to unlock comms')}
            {renderSection('Battlefield', 'var(--bw-red)', battlefields, 'No active battlefields. Comms open during live Shots Fired and War events.', mockBattlefields)}
            {renderSection('Direct Messages', 'var(--bw-muted)', directs, 'No direct messages yet. Start a conversation from a profile.')}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
