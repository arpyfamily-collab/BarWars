'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Shield, Sword, Plus } from 'lucide-react'

type FABState = 'declare' | 'join_attack' | 'defend' | 'default'

interface FABConfig {
  label: string
  color: string
  bg: string
  icon: typeof Flame
  href: string
  pulse: boolean
}

const FAB_CONFIG: Record<FABState, FABConfig> = {
  defend: {
    label: 'DEFEND NOW',
    color: '#fff',
    bg: '#E03131',
    icon: Shield,
    href: '/turf-wars?action=defend',
    pulse: true,
  },
  join_attack: {
    label: 'JOIN THE FIGHT',
    color: '#fff',
    bg: '#C9A84C',
    icon: Sword,
    href: '/turf-wars?action=join',
    pulse: true,
  },
  declare: {
    label: 'DECLARE INTENT',
    color: '#fff',
    bg: '#2D6A4F',
    icon: Flame,
    href: '/turf-wars?action=declare',
    pulse: false,
  },
  default: {
    label: 'ENTER WAR ROOM',
    color: '#fff',
    bg: '#161B27',
    icon: Plus,
    href: '/turf-wars',
    pulse: false,
  },
}

export default function ContextFAB() {
  const [fabState, setFabState] = useState<FABState>('default')
  const [visible, setVisible] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/turf-wars/context')
      .then(r => r.json())
      .then(d => {
        if (d?.action && FAB_CONFIG[d.action as FABState]) {
          setFabState(d.action as FABState)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80
      setVisible(!nearBottom)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  const cfg = FAB_CONFIG[fabState]
  const Icon = cfg.icon

  return (
    <button
      onClick={() => router.push(cfg.href)}
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 24px',
        background: cfg.bg,
        border: 'none',
        borderRadius: 50,
        color: cfg.color,
        fontFamily: 'Bebas Neue, sans-serif',
        fontSize: 16,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        boxShadow: cfg.pulse
          ? `0 4px 24px ${cfg.bg}80, 0 0 0 0 ${cfg.bg}`
          : '0 4px 20px rgba(0,0,0,0.5)',
        animation: cfg.pulse ? 'fab-pulse 2s ease-in-out infinite' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <style>{`
        @keyframes fab-pulse {
          0%   { box-shadow: 0 4px 24px ${cfg.bg}80, 0 0 0 0 ${cfg.bg}60; }
          50%  { box-shadow: 0 4px 24px ${cfg.bg}80, 0 0 0 10px ${cfg.bg}00; }
          100% { box-shadow: 0 4px 24px ${cfg.bg}80, 0 0 0 0 ${cfg.bg}00; }
        }
      `}</style>
      <Icon size={16} />
      {cfg.label}
    </button>
  )
}
