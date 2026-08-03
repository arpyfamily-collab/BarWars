'use client'
/**
 * hooks/useChallengeLive.ts
 *
 * Subscribes to two real-time channels:
 *   1. challenge row updates (scores, status changes)
 *   2. score_events inserts (for the momentum feed)
 *
 * Returns live scores, recent events, time remaining, and connection state.
 * Automatically cleans up subscriptions on unmount.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface LiveScores {
  challenger_score: number
  opponent_score:   number
  challenger_bar_id: string
  opponent_bar_id:  string
  status:           string
  window_end:       string
}

export interface ScoreEvent {
  id:          string
  bar_id:      string
  event_type:  string
  points:      number
  occurred_at: string
  patron_name?: string
}

export interface ChallengeBar {
  id:      string
  name:    string
  slug:    string
  wins:    number
  losses:  number
}

export interface ChallengeDetail {
  id:                 string
  status:             string
  trash_talk:         string
  stakes_description: string
  window_start:       string
  window_end:         string
  challenger_score:   number
  opponent_score:     number
  challenger_bar_id:  string
  opponent_bar_id:    string
  winner_bar_id?:     string
  challenger:         ChallengeBar
  opponent:           ChallengeBar
}

interface UseChallengeReturn {
  challenge:       ChallengeDetail | null
  scores:          LiveScores | null
  recentEvents:    ScoreEvent[]
  participantCounts: Record<string, number>
  myParticipation: { chosen_bar_id: string; points_contributed: number; referral_code: string } | null
  secondsRemaining: number
  connected:       boolean
  loading:         boolean
  prevLeader:      string | null  // for flip animation
}

export function useChallengeLive(
  challengeId:  string,
  userId?:      string
): UseChallengeReturn {
  const [challenge,          setChallenge]         = useState<ChallengeDetail | null>(null)
  const [scores,             setScores]            = useState<LiveScores | null>(null)
  const [recentEvents,       setRecentEvents]      = useState<ScoreEvent[]>([])
  const [participantCounts,  setParticipantCounts] = useState<Record<string, number>>({})
  const [myParticipation,    setMyParticipation]   = useState<{ chosen_bar_id: string; points_contributed: number; referral_code: string } | null>(null)
  const [secondsRemaining,   setSecondsRemaining]  = useState(0)
  const [connected,          setConnected]         = useState(false)
  const [loading,            setLoading]           = useState(true)
  const [prevLeader,         setPrevLeader]        = useState<string | null>(null)

  const prevLeaderRef = useRef<string | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelsRef   = useRef<RealtimeChannel[]>([])

  const computeLeader = useCallback((challenger_score: number, opponent_score: number, challenger_bar_id: string, opponent_bar_id: string) => {
    if (challenger_score > opponent_score) return challenger_bar_id
    if (opponent_score > challenger_score) return opponent_bar_id
    return null
  }, [])

  const startTimer = useCallback((windowEnd: string) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const calc = () => {
      const secs = Math.max(0, Math.floor((new Date(windowEnd).getTime() - Date.now()) / 1000))
      setSecondsRemaining(secs)
    }
    calc()
    timerRef.current = setInterval(calc, 1000)
  }, [])

  // Initial data fetch
  useEffect(() => {
    if (!challengeId) return
    const supabase = createClient()

    async function load() {
      setLoading(true)

      // Challenge + bars
      const { data: ch } = await supabase
        .from('bar_challenges')
        .select(`
          id, status, trash_talk, stakes_description,
          window_start, window_end,
          challenger_score, opponent_score,
          challenger_bar_id, opponent_bar_id, winner_bar_id,
          challenger:venues!challenger_bar_id(id, name, slug, wins, losses),
          opponent:venues!opponent_bar_id(id, name, slug, wins, losses)
        `)
        .eq('id', challengeId)
        .single()

      if (ch) {
        setChallenge(ch as unknown as ChallengeDetail)
        setScores({
          challenger_score:  (ch as any).challenger_score,
          opponent_score:    (ch as any).opponent_score,
          challenger_bar_id: (ch as any).challenger_bar_id,
          opponent_bar_id:   (ch as any).opponent_bar_id,
          status:            (ch as any).status,
          window_end:        (ch as any).window_end,
        })
        startTimer((ch as any).window_end)

        const leader = computeLeader(
          (ch as any).challenger_score, (ch as any).opponent_score,
          (ch as any).challenger_bar_id, (ch as any).opponent_bar_id
        )
        prevLeaderRef.current = leader
        setPrevLeader(leader)
      }

      // Recent score events (last 15)
      const { data: events } = await supabase
        .from('challenge_score_events')
        .select('id, bar_id, event_type, points, occurred_at, profiles!inner(full_name)')
        .eq('challenge_id', challengeId)
        .order('occurred_at', { ascending: false })
        .limit(15)

      setRecentEvents((events ?? []).map((e: any) => ({
        id:          e.id,
        bar_id:      e.bar_id,
        event_type:  e.event_type,
        points:      e.points,
        occurred_at: e.occurred_at,
        patron_name: e.profiles?.full_name,
      })))

      // Participant counts
      const { data: parts } = await supabase
        .from('challenge_participants')
        .select('chosen_bar_id')
        .eq('challenge_id', challengeId)

      const counts = (parts ?? []).reduce((acc: Record<string, number>, p: any) => {
        acc[p.chosen_bar_id] = (acc[p.chosen_bar_id] ?? 0) + 1
        return acc
      }, {})
      setParticipantCounts(counts)

      // My participation
      if (userId) {
        const { data: mine } = await supabase
          .from('challenge_participants')
          .select('chosen_bar_id, points_contributed, referral_code')
          .eq('challenge_id', challengeId)
          .eq('user_id', userId)
          .single()
        if (mine) setMyParticipation(mine as any)
      }

      setLoading(false)
    }

    load()

    // ── Real-time: challenge row updates (scores, status) ─────────────────
    const challengeChannel = supabase
      .channel(`challenge:${challengeId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'bar_challenges',
        filter: `id=eq.${challengeId}`,
      }, payload => {
        const n = payload.new as any

        setScores({
          challenger_score:  n.challenger_score,
          opponent_score:    n.opponent_score,
          challenger_bar_id: n.challenger_bar_id,
          opponent_bar_id:   n.opponent_bar_id,
          status:            n.status,
          window_end:        n.window_end,
        })

        setChallenge(prev => prev ? { ...prev, ...n } : prev)

        // Detect lead flip for animation
        const newLeader = computeLeader(
          n.challenger_score, n.opponent_score,
          n.challenger_bar_id, n.opponent_bar_id
        )
        if (newLeader !== prevLeaderRef.current) {
          setPrevLeader(prevLeaderRef.current)
          prevLeaderRef.current = newLeader
        }
      })
      .subscribe(status => {
        setConnected(status === 'SUBSCRIBED')
      })

    // ── Real-time: new score events (momentum feed) ───────────────────────
    const eventsChannel = supabase
      .channel(`score_events:${challengeId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'challenge_score_events',
        filter: `challenge_id=eq.${challengeId}`,
      }, payload => {
        const e = payload.new as any
        setRecentEvents(prev => [{
          id:          e.id,
          bar_id:      e.bar_id,
          event_type:  e.event_type,
          points:      e.points,
          occurred_at: e.occurred_at,
          patron_name: undefined,  // name not available on insert payload; fetched on load
        }, ...prev].slice(0, 15))

        // Update participant counts
        setParticipantCounts(prev => ({
          ...prev,
          [e.bar_id]: (prev[e.bar_id] ?? 0),  // count managed by join endpoint
        }))
      })
      .subscribe()

    channelsRef.current = [challengeChannel, eventsChannel]

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [challengeId, userId, startTimer, computeLeader])

  return {
    challenge,
    scores,
    recentEvents,
    participantCounts,
    myParticipation,
    secondsRemaining,
    connected,
    loading,
    prevLeader,
  }
}
