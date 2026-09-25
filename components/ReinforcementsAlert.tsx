'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Zap, X } from 'lucide-react'

export default function ReinforcementsAlert() {
  const [alert, setAlert] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Expose a global function for TurfMap to call
  useEffect(() => {
    ;(window as any).__radarAlert = (msg: string) => {
      setAlert(msg)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setAlert(null), 8000)
    }
    return () => { delete (window as any).__radarAlert }
  }, [])

  // Poll radar API for reinforcements detection
  const checkReinforcements = useCallback(async () => {
    try {
      const res = await fetch('/api/radar/live')
      if (!res.ok) return
      const users = await res.json()
      if (!Array.isArray(users)) return

      const rallying = users.filter((u: any) => u.status === 'rallying')
      if (rallying.length < 5) return

      const bySkin: Record<string, number> = {}
      for (const u of rallying) {
        bySkin[u.skin_name] = (bySkin[u.skin_name] ?? 0) + 1
      }

      for (const [skinName, count] of Object.entries(bySkin)) {
        if (count >= 5) {
          const msg = `Reinforcements incoming — ${count} soldiers in ${skinName} approaching the Square`
          setAlert(msg)
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => setAlert(null), 8000)
          break
        }
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    checkReinforcements()
    const interval = setInterval(checkReinforcements, 30_000)
    return () => clearInterval(interval)
  }, [checkReinforcements])

  if (!alert) return null

  return (
    <div style={{
      background: 'var(--bw-violet-glow)',
      border: '1px solid rgba(123,44,191,0.4)',
      borderRadius: 'var(--bw-radius-lg)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: 'pulse-flare 1.6s ease-in-out infinite',
    }}>
      <Zap size={18} style={{ color: 'var(--bw-violet-soft)', flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--bw-violet-soft)' }}>
        {alert}
      </div>
      <button
        onClick={() => setAlert(null)}
        style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', cursor: 'pointer', padding: 2 }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
