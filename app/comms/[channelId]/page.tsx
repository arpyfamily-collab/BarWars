'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { ArrowLeft, Megaphone, Eye, Send, MoreVertical, Flag, Ban, X } from 'lucide-react'

interface Message {
  id: string
  channel_id: string
  sender_id: string | null
  content: string
  is_rally_call: boolean
  is_intel: boolean
  created_at: string
  sender_name?: string | null
}

interface ChannelInfo {
  id: string
  name: string
  channel_type: string
  is_active: boolean
  member_count: number
}

const TYPE_COLORS: Record<string, string> = {
  war_room: 'var(--bw-violet)',
  hessian: 'var(--bw-cyan)',
  battlefield: 'var(--bw-red)',
  direct: 'var(--bw-muted)',
}

const TYPE_LABELS: Record<string, string> = {
  war_room: 'War Room',
  hessian: 'Hessian',
  battlefield: 'Battlefield',
  direct: 'Direct',
}

const REPORT_REASONS = ['Harassment', 'Hate speech', 'Sexual content', 'Spam', 'Other'] as const
type ReportReason = typeof REPORT_REASONS[number]

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getSenderDisplay(msg: Message): string {
  if (!msg.sender_id) return 'Deleted user'
  if (!msg.sender_name) return 'Player'
  return msg.sender_name
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const channelId = params.channelId as string
  const supabase = createClient()

  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [rallyMode, setRallyMode] = useState(false)
  const [intelMode, setIntelMode] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Action menu state
  const [menuMessage, setMenuMessage] = useState<Message | null>(null)
  const [reportMessage, setReportMessage] = useState<Message | null>(null)
  const [blockMessage, setBlockMessage] = useState<Message | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, channel_id, sender_id, content, is_rally_call, is_intel, created_at,
        sender:public_profiles!messages_sender_id_fkey(display_name)
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessages([])
      return
    }

    const mapped: Message[] = (data ?? []).map((m: any) => ({
      id: m.id,
      channel_id: m.channel_id,
      sender_id: m.sender_id,
      content: m.content,
      is_rally_call: m.is_rally_call,
      is_intel: m.is_intel,
      created_at: m.created_at,
      sender_name: m.sender?.display_name ?? null,
    }))

    setMessages(mapped)
    setLoading(false)
    setTimeout(scrollToBottom, 100)
  }, [supabase, channelId, scrollToBottom])

  const fetchChannelInfo = useCallback(async () => {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle()

    if (error || !data) return

    const { count } = await supabase
      .from('channel_members')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelId)

    setChannel({
      id: data.id,
      name: data.name,
      channel_type: data.channel_type,
      is_active: data.is_active,
      member_count: count ?? 0,
    })
  }, [supabase, channelId])

  const autoJoinBattlefield = useCallback(async (userId: string) => {
    if (!channel) return
    if (channel.channel_type !== 'battlefield') return

    const { data: existing } = await supabase
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from('channel_members')
        .insert({ channel_id: channelId, user_id: userId })
    }
  }, [supabase, channelId, channel])

  const updateReadStatus = useCallback(async (userId: string) => {
    const { data: existing } = await supabase
      .from('channel_read_status')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('channel_read_status')
        .update({ last_read_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('channel_read_status')
        .insert({ channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() })
    }
  }, [supabase, channelId])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      await fetchChannelInfo()
      await fetchMessages()
      await autoJoinBattlefield(user.id)
      await updateReadStatus(user.id)
    })()
  }, [])

  useEffect(() => {
    if (!currentUserId) return

    const sub = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          setTimeout(scrollToBottom, 100)
          if (newMsg.sender_id !== currentUserId) {
            updateReadStatus(currentUserId)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [currentUserId, channelId, scrollToBottom, updateReadStatus, supabase])

  useEffect(() => {
    if (!channel || channel.channel_type !== 'battlefield') return
    const interval = setInterval(fetchChannelInfo, 10000)
    return () => clearInterval(interval)
  }, [channel, fetchChannelInfo])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const handleSend = async () => {
    if (!input.trim() || !currentUserId || sending) return
    setSending(true)

    const { error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: currentUserId,
        content: input.trim(),
        is_rally_call: rallyMode,
        is_intel: intelMode,
      })

    if (!error) {
      setInput('')
      setRallyMode(false)
      setIntelMode(false)
      await updateReadStatus(currentUserId)
    } else {
      if (error.code === '42501' && channel?.channel_type === 'direct') {
        setToast("You can't message this player.")
      }
    }
    setSending(false)
  }

  const handleReport = async (reason: ReportReason) => {
    if (!reportMessage) return
    setActionLoading(true)
    setActionError(null)

    const { error: rpcError } = await supabase.rpc('report_message', {
      p_message_id: reportMessage.id,
      p_reason: reason,
    })

    if (rpcError) {
      setActionError(rpcError.message)
      setActionLoading(false)
      return
    }

    setMessages(prev => prev.filter(m => m.id !== reportMessage.id))
    setReportMessage(null)
    setActionLoading(false)
    setToast('Reported. Our team reviews reports within 24 hours.')
  }

  const handleBlock = async () => {
    if (!blockMessage || !currentUserId || !blockMessage.sender_id) return
    setActionLoading(true)
    setActionError(null)

    const { error: insertError } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: currentUserId, blocked_id: blockMessage.sender_id })

    if (insertError && insertError.code !== '23505') {
      setActionError(insertError.message)
      setActionLoading(false)
      return
    }

    const blockedName = getSenderDisplay(blockMessage)
    setMessages(prev => prev.filter(m => m.sender_id !== blockMessage.sender_id))
    setBlockMessage(null)
    setActionLoading(false)
    setToast(`${blockedName} blocked.`)
  }

  const accentColor = channel ? (TYPE_COLORS[channel.channel_type] ?? 'var(--bw-muted)') : 'var(--bw-muted)'

  const inputBorderColor = rallyMode ? 'var(--bw-flare)' : intelMode ? 'var(--bw-cyan)' : '#252D3D'
  const placeholder = rallyMode ? 'RALLY YOUR TROOPS...' : intelMode ? 'Drop intel...' : 'Send a message...'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100dvh', background: '#0D1117' }}>

      {/* Chat Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px', borderBottom: '1px solid #252D3D',
        background: '#13171F',
      }}>
        <Link href="/comms" style={{ color: 'var(--bw-muted)', textDecoration: 'none', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--bw-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {channel?.name ?? 'Loading…'}
            </span>
            {channel && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: accentColor, padding: '2px 7px', borderRadius: 12,
                background: `${accentColor}1A`,
              }}>
                {TYPE_LABELS[channel.channel_type] ?? channel.channel_type}
              </span>
            )}
          </div>
          {channel && (
            <div style={{ fontSize: 11, color: 'var(--bw-muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {channel.member_count} members
              {channel.channel_type === 'battlefield' && channel.is_active && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--bw-red)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--bw-red)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                  LIVE
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Message List */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--bw-muted)', fontSize: 13, marginTop: 20 }}>
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--bw-muted)', fontSize: 13, marginTop: 20 }}>
            No messages yet. Be the first to strike.
          </div>
        ) : (
          messages.map(msg => {
            const isOwn = msg.sender_id === currentUserId
            const senderDisplay = isOwn ? 'You' : getSenderDisplay(msg)

            if (msg.is_rally_call) {
              return (
                <div key={msg.id} style={{
                  width: '100%',
                  background: 'rgba(245,184,0,0.08)',
                  border: '1px solid rgba(245,184,0,0.3)',
                  borderRadius: 14, padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <Megaphone size={18} style={{ color: 'var(--bw-flare)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bw-flare)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Rally Call — {senderDisplay}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bw-text)', lineHeight: 1.4 }}>
                      {msg.content}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--bw-muted)', marginTop: 4 }}>
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                  {!isOwn && (
                    <button
                      aria-label="Message options"
                      onClick={() => setMenuMessage(msg)}
                      onContextMenu={e => { e.preventDefault(); setMenuMessage(msg) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
                    >
                      <MoreVertical size={16} />
                    </button>
                  )}
                </div>
              )
            }

            return (
              <div
                key={msg.id}
                style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}
                onTouchStart={e => {
                  if (isOwn) return
                  const touch = e.touches[0]
                  const timer = setTimeout(() => setMenuMessage(msg), 500)
                  const startX = touch.clientX
                  const startY = touch.clientY
                  const cancel = () => clearTimeout(timer)
                  e.currentTarget.addEventListener('touchend', cancel, { once: true })
                  e.currentTarget.addEventListener('touchmove', (ev: TouchEvent) => {
                    if (Math.abs(ev.touches[0].clientX - startX) > 10 || Math.abs(ev.touches[0].clientY - startY) > 10) cancel()
                  }, { once: true })
                }}
              >
                <div style={{
                  maxWidth: '78%',
                  background: isOwn ? 'var(--bw-violet)' : 'var(--bw-card)',
                  border: msg.is_intel ? `1px solid var(--bw-cyan)` : 'none',
                  borderLeft: msg.is_intel ? '3px solid var(--bw-cyan)' : undefined,
                  borderRadius: 16, padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {msg.is_intel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: 'var(--bw-cyan)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      <Eye size={11} /> Intel
                    </div>
                  )}
                  {!isOwn && !msg.is_intel && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-violet-soft)' }}>
                        {senderDisplay}
                      </span>
                      <button
                        aria-label="Message options"
                        onClick={() => setMenuMessage(msg)}
                        onContextMenu={e => { e.preventDefault(); setMenuMessage(msg) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-muted)', padding: 0, display: 'flex' }}
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  )}
                  <div style={{
                    fontSize: 14, lineHeight: 1.4,
                    color: isOwn ? '#fff' : 'var(--bw-text)',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: 9, color: isOwn ? 'rgba(255,255,255,0.5)' : 'var(--bw-muted)', textAlign: 'right' }}>
                    {formatTime(msg.created_at)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bw-surface)', border: '1px solid var(--bw-border)',
          borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--bw-text)',
          zIndex: 100, maxWidth: '90%', textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}

      {/* Input Bar */}
      <div style={{
        flexShrink: 0, padding: '10px 12px',
        borderTop: '1px solid #252D3D', background: '#13171F',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button
          onClick={() => { setRallyMode(!rallyMode); if (!rallyMode) setIntelMode(false) }}
          style={{
            width: 38, height: 38, flexShrink: 0,
            border: 'none', borderRadius: 10, cursor: 'pointer',
            background: rallyMode ? 'var(--bw-flare)' : 'rgba(245,184,0,0.12)',
            color: rallyMode ? '#0A0A0C' : 'var(--bw-flare)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          title="Rally call"
        >
          <Megaphone size={16} />
        </button>
        <button
          onClick={() => { setIntelMode(!intelMode); if (!intelMode) setRallyMode(false) }}
          style={{
            width: 38, height: 38, flexShrink: 0,
            border: 'none', borderRadius: 10, cursor: 'pointer',
            background: intelMode ? 'var(--bw-cyan)' : 'rgba(0,188,212,0.12)',
            color: intelMode ? '#0A0A0C' : 'var(--bw-cyan)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          title="Intel drop"
        >
          <Eye size={16} />
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={placeholder}
          style={{
            flex: 1, height: 38,
            background: '#0D1117',
            border: `1px solid ${inputBorderColor}`,
            borderRadius: 10, padding: '0 12px',
            fontSize: 14, color: 'var(--bw-text)',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            width: 38, height: 38, flexShrink: 0,
            border: 'none', borderRadius: 10, cursor: 'pointer',
            background: 'var(--bw-violet)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (!input.trim() || sending) ? 0.4 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>

      {/* Message Options Menu */}
      {menuMessage && (
        <div
          onClick={() => setMenuMessage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#13171F', border: '1px solid #252D3D', borderRadius: 14, padding: 8, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <button
              onClick={() => { setReportMessage(menuMessage); setMenuMessage(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-text)', fontSize: 14, borderRadius: 8, textAlign: 'left' }}
            >
              <Flag size={16} style={{ color: 'var(--bw-red)' }} />
              Report message
            </button>
            {menuMessage.sender_id && (
              <button
                onClick={() => { setBlockMessage(menuMessage); setMenuMessage(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-text)', fontSize: 14, borderRadius: 8, textAlign: 'left' }}
              >
                <Ban size={16} style={{ color: 'var(--bw-red)' }} />
                Block {getSenderDisplay(menuMessage)}
              </button>
            )}
            <button
              onClick={() => setMenuMessage(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-muted)', fontSize: 14, borderRadius: 8, textAlign: 'left' }}
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Report Dialog */}
      {reportMessage && (
        <div
          onClick={() => !actionLoading && setReportMessage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#13171F', border: '1px solid #252D3D', borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--bw-text)' }}>
              Why are you reporting this?
            </div>
            {actionError && (
              <div style={{ fontSize: 12, color: 'var(--bw-red)', background: 'rgba(224,49,49,0.1)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 8, padding: '8px 10px' }}>
                {actionError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {REPORT_REASONS.map(reason => (
                <button
                  key={reason}
                  disabled={actionLoading}
                  onClick={() => handleReport(reason)}
                  style={{ padding: '12px 14px', background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--bw-text)', fontSize: 14, textAlign: 'left' }}
                >
                  {reason}
                </button>
              ))}
            </div>
            <button
              onClick={() => setReportMessage(null)}
              disabled={actionLoading}
              style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bw-muted)', fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Block Confirmation Dialog */}
      {blockMessage && (
        <div
          onClick={() => !actionLoading && setBlockMessage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#13171F', border: '1px solid #252D3D', borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ fontSize: 15, color: 'var(--bw-text)', lineHeight: 1.5 }}>
              Block {getSenderDisplay(blockMessage)}? You won&apos;t see their messages, and neither of you can message the other directly. You can unblock them from your Account page.
            </div>
            {actionError && (
              <div style={{ fontSize: 12, color: 'var(--bw-red)', background: 'rgba(224,49,49,0.1)', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 8, padding: '8px 10px' }}>
                {actionError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setBlockMessage(null)}
                disabled={actionLoading}
                style={{ flex: 1, padding: '11px 14px', background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--bw-text)', fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={handleBlock}
                disabled={actionLoading}
                style={{ flex: 1, padding: '11px 14px', background: 'var(--bw-red)', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 600 }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
