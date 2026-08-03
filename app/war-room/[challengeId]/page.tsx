'use client'
/**
 * /war-room/[challengeId]
 *
 * Gated to checked-in fighters on one side only (RLS enforces this).
 * Layout: top = battle cry + top fighters | bottom = scrollable chat + input
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useWarRoom } from '@/hooks/useWarRoom'
import BottomNav from '@/components/BottomNav'

const EMOJIS = ['🔥', '💪', '⚡', '👀', '😤']
const BLOCKED_WORDS = ['fuck', 'shit', 'bitch', 'ass', 'damn']

function clientFilter(text: string): boolean {
  const lower = text.toLowerCase()
  return !BLOCKED_WORDS.some(w => lower.includes(w))
}

function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export default function WarRoomPage({ params }: { params: { challengeId: string } }) {
  const router = useRouter()
  const [userId,      setUserId]      = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Fighter')
  const [barId,       setBarId]       = useState<string | null>(null)
  const [barName,     setBarName]     = useState('')
  const [barColor,    setBarColor]    = useState('#E24B4A')
  const [input,       setInput]       = useState('')
  const [cryInput,    setCryInput]    = useState('')
  const [showCryForm, setShowCryForm] = useState(false)
  const [filterErr,   setFilterErr]   = useState(false)
  const [myPoints,    setMyPoints]    = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, battleCry, topFighters, connected, sending,
          sendMessage, reactToMessage, setBattleCry, reportMessage } = useWarRoom(
    params.challengeId,
    barId ?? '',
    userId ?? '',
    displayName
  )

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserId(data.user.id)

      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', data.user.id).single()
      setDisplayName((profile as any)?.full_name?.split(' ')[0] ?? 'Fighter')

      const { data: part } = await supabase
        .from('challenge_participants')
        .select('chosen_bar_id, points_contributed, venues!inner(name)')
        .eq('challenge_id', params.challengeId)
        .eq('user_id', data.user.id)
        .single()

      if (!part || !(part as any).was_checked_in) {
        router.push(`/challenge/${params.challengeId}/battle`)
        return
      }
      setBarId((part as any).chosen_bar_id)
      setBarName((part as any).venues?.name ?? '')
      setMyPoints((part as any).points_contributed ?? 0)
      setBarColor((part as any).chosen_bar_id === params.challengeId ? '#E24B4A' : '#378ADD')
    })
  }, [params.challengeId, router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend() {
    if (!input.trim()) return
    if (!clientFilter(input)) { setFilterErr(true); setTimeout(() => setFilterErr(false), 2000); return }
    await sendMessage(input)
    setInput('')
  }

  async function handleBattleCry() {
    if (!cryInput.trim()) return
    await setBattleCry(cryInput)
    setCryInput('')
    setShowCryForm(false)
  }

  const myRank = topFighters.findIndex(f => f.user_id === userId) + 1

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', maxHeight: '100dvh' }}>

      {/* Header */}
      <div style={{ padding: '48px 20px 12px', borderBottom: '1px solid var(--bw-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', color: barColor }}>
              War Room
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
              {barName} fighters only
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--bw-green)' : 'var(--bw-muted)', boxShadow: connected ? '0 0 6px var(--bw-green)' : 'none' }} />
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', fontSize: 13, cursor: 'pointer' }}>
              ← Battle
            </button>
          </div>
        </div>
      </div>

      {/* Battle cry */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bw-border)', flexShrink: 0 }}>
        {battleCry ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, color: barColor, fontWeight: 700, marginRight: 8 }}>⚡ BATTLE CRY</span>
              <span style={{ fontSize: 14, color: 'var(--bw-text)', fontWeight: 600 }}>"{battleCry.cry}"</span>
              <span style={{ fontSize: 11, color: 'var(--bw-muted)', marginLeft: 6 }}>— {battleCry.display_name}</span>
            </div>
            {(myRank === 1 || myRank === 0) && (
              <button onClick={() => setShowCryForm(v => !v)} style={{ background: 'none', border: '1px solid var(--bw-border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--bw-muted)', cursor: 'pointer' }}>
                Change
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>No battle cry set yet</span>
            <button onClick={() => setShowCryForm(v => !v)} style={{ background: 'none', border: `1px solid ${barColor}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: barColor, cursor: 'pointer' }}>
              Set cry
            </button>
          </div>
        )}

        {showCryForm && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ fontSize: 13, padding: '7px 10px' }}
              placeholder="60 char max…"
              maxLength={60}
              value={cryInput}
              onChange={e => setCryInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBattleCry()}
            />
            <button onClick={handleBattleCry} style={{ padding: '7px 14px', background: barColor, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Set
            </button>
          </div>
        )}
      </div>

      {/* Top fighters strip */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bw-border)', overflowX: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
          {topFighters.map((f, i) => (
            <div key={f.user_id} style={{
              display:        'flex',
              alignItems:     'center',
              gap:            6,
              background:     f.user_id === userId ? `${barColor}18` : 'var(--bw-card)',
              border:         `1px solid ${f.user_id === userId ? barColor : 'var(--bw-border)'}`,
              borderRadius:   20,
              padding:        '4px 10px',
              fontSize:       12,
              whiteSpace:     'nowrap',
            }}>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, color: barColor }}>#{i + 1}</span>
              <span style={{ color: 'var(--bw-text)', fontWeight: f.user_id === userId ? 600 : 400 }}>
                {f.user_id === userId ? 'You' : f.display_name}
              </span>
              <span style={{ color: barColor, fontWeight: 600 }}>{f.points_contributed}pts</span>
            </div>
          ))}
          {topFighters.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>Be the first to check in and earn points</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--bw-muted)', fontSize: 13, padding: '32px 0' }}>
            No messages yet. Fire it up.
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.user_id === userId
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
              {!isMe && (
                <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginBottom: 2, paddingLeft: 4 }}>
                  {msg.display_name}
                </div>
              )}
              <div style={{ maxWidth: '78%' }}>
                <div style={{
                  background:   isMe ? barColor : 'var(--bw-card)',
                  color:        isMe ? '#fff' : 'var(--bw-text)',
                  padding:      '8px 12px',
                  borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  fontSize:     14,
                  lineHeight:   1.4,
                  border:       isMe ? 'none' : '1px solid var(--bw-border)',
                }}>
                  {msg.body}
                </div>

                {/* Reactions */}
                <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  {EMOJIS.filter(e => (msg.reactions[e] ?? 0) > 0).map(emoji => (
                    <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)}
                      style={{ background: 'var(--bw-card)', border: '1px solid var(--bw-border)', borderRadius: 12, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--bw-text)' }}>
                      {emoji} {msg.reactions[emoji]}
                    </button>
                  ))}
                  <button onClick={() => {
                    const emojiPick = window.prompt(`React: ${EMOJIS.join(' ')}`)
                    if (emojiPick && EMOJIS.includes(emojiPick.trim())) reactToMessage(msg.id, emojiPick.trim())
                  }} style={{ background: 'none', border: '1px dashed var(--bw-border)', borderRadius: 12, padding: '2px 6px', fontSize: 10, cursor: 'pointer', color: 'var(--bw-muted)' }}>
                    +
                  </button>

                  <span style={{ fontSize: 10, color: 'var(--bw-muted)', alignSelf: 'center', marginLeft: 2 }}>
                    {relTime(msg.created_at)}
                  </span>

                  {!isMe && (
                    <button onClick={() => reportMessage(msg.id)}
                      style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--bw-muted)', cursor: 'pointer', padding: '0 2px' }}
                      title="Report">
                      ⚑
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 20px 28px', borderTop: '1px solid var(--bw-border)', flexShrink: 0, background: 'var(--bw-black)' }}>
        {filterErr && (
          <div style={{ fontSize: 11, color: 'var(--bw-red)', marginBottom: 6 }}>
            Keep it clean in here
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 14 }}
            placeholder={`Say something, ${displayName}…`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            maxLength={280}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              background: barColor, border: 'none', borderRadius: 10,
              width: 40, height: 40, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: (!input.trim() || sending) ? 0.4 : 1,
              fontSize: 18,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 4, textAlign: 'right' }}>
          {input.length}/280 · {myPoints} pts · rank {myRank || '?'}
        </div>
      </div>

    </div>
  )
}
