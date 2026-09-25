'use client'

import { useEffect, useState, useRef } from 'react'
import { Zap } from 'lucide-react'

interface Flare {
  id: string
  venue_id: string
  offer_text: string
  discount_desc: string
  expires_at: string
  fired_at: string
  venues: { name: string; slug: string } | null
}

function fmtCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '0:00'
  const m = Math.floor(diff / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ActiveFlare() {
  const [flares, setFlares] = useState<Flare[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const fetchFlares = async () => {
      try {
        const res = await fetch('/api/flares/active')
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data)) setFlares(data)
      } catch {
        // silently fail — flares are non-critical
      }
    }

    fetchFlares()
    const pollInterval = setInterval(fetchFlares, 30_000)

    return () => clearInterval(pollInterval)
  }, [])

  useEffect(() => {
    if (flares.length === 0) return
    timerRef.current = setInterval(() => {
      setFlares(prev => prev.filter(f => new Date(f.expires_at).getTime() > Date.now()))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [flares.length])

  if (flares.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {flares.map(flare => (
        <div
          key={flare.id}
          style={{
            background: 'rgba(245,184,0,0.08)',
            border: '1px solid var(--bw-flare)',
            borderRadius: 'var(--bw-radius-lg)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            animation: 'pulse-flare 1.6s ease-in-out infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Zap size={20} style={{ color: 'var(--bw-flare)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bw-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {flare.venues?.name ?? 'A bar'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--bw-flare)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {flare.offer_text}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: 'var(--bw-flare)' }}>
            {fmtCountdown(flare.expires_at)}
          </div>
        </div>
      ))}
    </div>
  )
}
