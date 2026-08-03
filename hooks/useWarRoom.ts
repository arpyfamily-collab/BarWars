'use client'
/**
 * hooks/useWarRoom.ts
 *
 * Real-time hook for the War Room.
 * Provides: messages, reactions, battle cry, top fighters, and
 * a sendMessage / sendReaction / setBattleCry interface.
 *
 * Access is gated server-side via RLS — only checked-in fighters
 * on the correct side get data. Client just subscribes; no client-side gate.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

export interface WRMessage {
  id:           string
  user_id:      string
  display_name: string
  body:         string
  flagged:      boolean
  created_at:   string
  reactions:    Record<string, number>  // emoji → count
}

export interface TopFighter {
  user_id:            string
  display_name:       string
  points_contributed: number
}

export interface BattleCry {
  cry:          string
  display_name: string
  set_at:       string
}

interface UseWarRoomReturn {
  messages:    WRMessage[]
  battleCry:   BattleCry | null
  topFighters: TopFighter[]
  connected:   boolean
  sending:     boolean
  sendMessage:    (body: string) => Promise<void>
  reactToMessage: (messageId: string, emoji: string) => Promise<void>
  setBattleCry:   (cry: string) => Promise<void>
  reportMessage:  (messageId: string) => Promise<void>
}

const ALLOWED_EMOJIS = ['🔥', '💪', '⚡', '👀', '😤']
const MAX_MESSAGES   = 50

export function useWarRoom(
  challengeId: string,
  barId:       string,
  userId:      string,
  displayName: string
): UseWarRoomReturn {
  const [messages,    setMessages]    = useState<WRMessage[]>([])
  const [battleCry,   setBattleCryState] = useState<BattleCry | null>(null)
  const [topFighters, setTopFighters] = useState<TopFighter[]>([])
  const [connected,   setConnected]   = useState(false)
  const [sending,     setSending]     = useState(false)
  const channelsRef = useRef<any[]>([])

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!challengeId || !barId || !userId) return
    const supabase = createClient()

    async function load() {
      // Last 50 messages
      const { data: msgs } = await supabase
        .from('war_room_messages')
        .select(`
          id, user_id, display_name, body, flagged, created_at,
          war_room_reactions(emoji, user_id)
        `)
        .eq('challenge_id', challengeId)
        .eq('bar_id', barId)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)

      if (msgs) {
        setMessages(msgs.map(normaliseMessage).reverse())
      }

      // Active battle cry
      const { data: cry } = await supabase
        .from('battle_cries')
        .select('cry, profiles!inner(full_name), set_at')
        .eq('challenge_id', challengeId)
        .eq('bar_id', barId)
        .single()

      if (cry) {
        setBattleCryState({
          cry:          (cry as any).cry,
          display_name: (cry as any).profiles?.full_name ?? 'Unknown',
          set_at:       (cry as any).set_at,
        })
      }

      // Top 5 fighters for this bar
      const { data: fighters } = await supabase
        .from('challenge_participants')
        .select('user_id, points_contributed, profiles!inner(full_name)')
        .eq('challenge_id', challengeId)
        .eq('chosen_bar_id', barId)
        .eq('was_checked_in', true)
        .order('points_contributed', { ascending: false })
        .limit(5)

      if (fighters) {
        setTopFighters(fighters.map((f: any) => ({
          user_id:            f.user_id,
          display_name:       f.profiles?.full_name ?? 'Fighter',
          points_contributed: f.points_contributed,
        })))
      }
    }

    load()

    // ── Real-time: new messages ─────────────────────────────────────────
    const msgChannel = supabase
      .channel(`war-room:${challengeId}:${barId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'war_room_messages',
        filter: `challenge_id=eq.${challengeId}`,
      }, payload => {
        const m = payload.new as any
        if (m.bar_id !== barId || m.deleted) return
        setMessages(prev => [
          ...prev.slice(-(MAX_MESSAGES - 1)),
          { id: m.id, user_id: m.user_id, display_name: m.display_name,
            body: m.body, flagged: m.flagged, created_at: m.created_at, reactions: {} },
        ])
      })
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'war_room_reactions',
      }, payload => {
        const r = payload.new as any
        setMessages(prev => prev.map(msg =>
          msg.id === r.message_id
            ? { ...msg, reactions: { ...msg.reactions, [r.emoji]: (msg.reactions[r.emoji] ?? 0) + 1 } }
            : msg
        ))
      })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'battle_cries',
        filter: `challenge_id=eq.${challengeId}`,
      }, payload => {
        const c = payload.new as any
        if (c.bar_id !== barId) return
        setBattleCryState({ cry: c.cry, display_name: displayName, set_at: c.set_at })
      })
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    channelsRef.current = [msgChannel]
    return () => { channelsRef.current.forEach(ch => supabase.removeChannel(ch)) }
  }, [challengeId, barId, userId, displayName])

  // ── Actions ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (body: string) => {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > 280 || sending) return
    setSending(true)
    try {
      await fetch('/api/war-room/' + challengeId + '/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bar_id: barId, body: trimmed }),
      })
    } finally {
      setSending(false)
    }
  }, [challengeId, barId, sending])

  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    if (!ALLOWED_EMOJIS.includes(emoji)) return
    await fetch('/api/war-room/' + challengeId + '/messages', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: messageId, emoji }),
    })
  }, [challengeId])

  const setBattleCry = useCallback(async (cry: string) => {
    const trimmed = cry.trim()
    if (!trimmed || trimmed.length > 60) return
    await fetch('/api/war-room/' + challengeId + '/battle-cry', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bar_id: barId, cry: trimmed }),
    })
  }, [challengeId, barId])

  const reportMessage = useCallback(async (messageId: string) => {
    await fetch('/api/war-room/' + challengeId + '/messages', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: messageId }),
    })
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }, [challengeId])

  return { messages, battleCry, topFighters, connected, sending, sendMessage, reactToMessage, setBattleCry, reportMessage }
}

function normaliseMessage(raw: any): WRMessage {
  const reactions = (raw.war_room_reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
    return acc
  }, {})
  return {
    id:           raw.id,
    user_id:      raw.user_id,
    display_name: raw.display_name,
    body:         raw.body,
    flagged:      raw.flagged,
    created_at:   raw.created_at,
    reactions,
  }
}
