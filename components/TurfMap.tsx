'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Flame, Shield, Crosshair, Zap, X, ChevronRight } from 'lucide-react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

interface BarTurf {
  bar_id: string
  bar_name: string
  turf_enabled: boolean
  threat_level: 'quiet' | 'tense' | 'shots_fired' | 'active_attack'
  active_shots_count: number
  turf_holder_name: string | null
  turf_holder_type: string | null
  holder_streak_weeks: number | null
  lat: number | null
  lng: number | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Oxford, MS — The Square
const OXFORD_CENTER: [number, number] = [-89.5187, 34.3668]

const THREAT_CONFIG = {
  quiet:         { label: 'Quiet',         color: '#2ECC71', pulse: false, icon: '🛡' },
  tense:         { label: 'Tense',         color: '#F5B800', pulse: false, icon: '⚡' },
  shots_fired:   { label: 'Shots Fired',   color: '#E03131', pulse: true,  icon: '🔥' },
  active_attack: { label: 'Active Attack', color: '#E03131', pulse: true,  icon: '⚔️' },
} as const

// ── Pin SVG factory ───────────────────────────────────────────────────────────

function buildPinSVG(color: string, icon: string, pulse: boolean): string {
  const glowOpacity = pulse ? '0.5' : '0.2'
  const safeColor = color.replace('#', '')
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="52" height="62" viewBox="0 0 52 62">
      <defs>
        <filter id="glow-${safeColor}">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="26" cy="24" r="20" fill="${color}" opacity="${glowOpacity}"/>
      <path d="M26 4 L46 12 L46 28 Q46 46 26 56 Q6 46 6 28 L6 12 Z"
            fill="#0D1117" stroke="${color}" stroke-width="2.5"/>
      <path d="M26 10 L41 17 L41 29 Q41 43 26 51 Q11 43 11 29 L11 17 Z"
            fill="${color}" opacity="0.15"/>
      <text x="26" y="31" text-anchor="middle" font-size="16" dominant-baseline="middle">${icon}</text>
    </svg>
  `
}

// ── Pulsing CSS animation injected once ──────────────────────────────────────

function injectPulseStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('turf-map-pulse-style')) return
  const style = document.createElement('style')
  style.id = 'turf-map-pulse-style'
  style.textContent = `
    @keyframes turf-pulse {
      0%   { transform: scale(1);   opacity: 1; }
      50%  { transform: scale(1.18); opacity: 0.85; }
      100% { transform: scale(1);   opacity: 1; }
    }
    .turf-pin-pulse { animation: turf-pulse 1.4s ease-in-out infinite; }

    .turf-sheet-enter {
      animation: turf-sheet-in 0.28s cubic-bezier(0.32,0.72,0,1) forwards;
    }
    @keyframes turf-sheet-in {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }

    .mapboxgl-ctrl-bottom-left,
    .mapboxgl-ctrl-bottom-right { display: none !important; }

    .turf-map-container .mapboxgl-canvas { border-radius: 16px; }
  `
  document.head.appendChild(style)
}

// ── Bottom Sheet ─────────────────────────────────────────────────────────────

function BarSheet({ bar, onClose }: { bar: BarTurf; onClose: () => void }) {
  const threat = THREAT_CONFIG[bar.threat_level] ?? THREAT_CONFIG.quiet

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        background: 'rgba(0,0,0,0.45)', borderRadius: 16,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="turf-sheet-enter"
        style={{
          width: '100%',
          background: '#13171F',
          borderTop: `2px solid ${threat.color}`,
          borderRadius: '16px 16px 0 0',
          padding: '20px 20px 28px',
        }}
      >
        <div style={{ width: 36, height: 4, background: '#2A3350', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.04em', lineHeight: 1 }}>
              {bar.bar_name}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: threat.color, padding: '3px 9px', borderRadius: 20,
              background: `${threat.color}1A`,
            }}>
              {threat.icon} {threat.label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#1C2333', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8B9BB4' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ background: '#0D1117', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          {bar.turf_holder_name ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>
                {bar.turf_holder_type === 'fraternity' ? '♂' : '♀'}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F0F0' }}>{bar.turf_holder_name}</div>
                <div style={{ fontSize: 11, color: '#8B9BB4', marginTop: 1 }}>Current turf holder</div>
              </div>
              {bar.holder_streak_weeks && bar.holder_streak_weeks > 0 && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#C9A84C', fontSize: 13, fontWeight: 700 }}>
                  <Flame size={14} />
                  {bar.holder_streak_weeks}w
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#8B9BB4' }}>
              {bar.turf_enabled ? 'Unclaimed territory — first org to claim wins' : 'Turf wars not enabled at this bar'}
            </div>
          )}
        </div>

        {bar.active_shots_count > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(224,49,49,0.1)', border: '1px solid rgba(224,49,49,0.3)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#E03131', fontWeight: 600,
          }}>
            <Crosshair size={15} />
            {bar.active_shots_count} active shot{bar.active_shots_count > 1 ? 's' : ''} fired — attack imminent
          </div>
        )}

        <Link href={`/turf-wars?bar=${bar.bar_id}`} style={{ textDecoration: 'none' }}>
          <button style={{
            width: '100%', padding: '13px 0',
            background: threat.color, border: 'none',
            borderRadius: 12, color: '#fff',
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.06em',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Enter the War Zone <ChevronRight size={18} />
          </button>
        </Link>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TurfMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<mapboxgl.Marker[]>([])

  const [bars, setBars]           = useState<BarTurf[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedBar, setSelectedBar] = useState<BarTurf | null>(null)
  const [mapReady, setMapReady]   = useState(false)

  const fetchBars = useCallback(() => {
    fetch('/api/turf-wars/map')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setBars(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchBars()
    const interval = setInterval(fetchBars, 60_000)
    return () => clearInterval(interval)
  }, [fetchBars])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    injectPulseStyle()

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      console.warn('TurfMap: NEXT_PUBLIC_MAPBOX_TOKEN not set')
      return
    }

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: OXFORD_CENTER,
      zoom: 15.2,
      pitch: 30,
      bearing: -10,
      interactive: true,
      attributionControl: false,
    })

    map.on('load', () => {
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', '#080B0F')
      }
      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || bars.length === 0) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    bars.forEach(bar => {
      if (bar.lat == null || bar.lng == null) return

      const threat = THREAT_CONFIG[bar.threat_level] ?? THREAT_CONFIG.quiet
      const svg    = buildPinSVG(threat.color, threat.icon, threat.pulse)

      const el = document.createElement('div')
      el.style.cssText = 'width:52px;height:62px;cursor:pointer;'
      if (threat.pulse) el.classList.add('turf-pin-pulse')
      el.innerHTML = svg

      el.addEventListener('click', () => setSelectedBar(bar))

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([bar.lng!, bar.lat!])
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [bars, mapReady])

  const barsWithCoords  = bars.filter(b => b.lat != null && b.lng != null)
  const barsWithoutCoords = bars.filter(b => b.lat == null || b.lng == null)

  return (
    <div style={{ paddingBottom: 8 }}>

      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>War Map</span>
        {bars.some(b => b.threat_level === 'active_attack' || b.threat_level === 'shots_fired') && (
          <span style={{ color: '#E03131', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E03131', display: 'inline-block',
              animation: 'turf-pulse 1.4s ease-in-out infinite' }} />
            LIVE ACTION
          </span>
        )}
      </div>

      {barsWithCoords.length > 0 ? (
        <div
          className="turf-map-container"
          style={{
            position: 'relative',
            width: '100%',
            height: 280,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid #252D3D',
            marginBottom: 10,
          }}
        >
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

          {loading && (
            <div style={{
              position: 'absolute', inset: 0, background: '#0D1117',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'var(--bw-muted)', borderRadius: 16,
            }}>
              Loading war map…
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 10, left: 10, zIndex: 5,
            background: 'rgba(13,17,23,0.9)', border: '1px solid #252D3D',
            borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {Object.entries(THREAT_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#8B9BB4' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                {cfg.label}
              </div>
            ))}
          </div>

          {selectedBar && (
            <BarSheet bar={selectedBar} onClose={() => setSelectedBar(null)} />
          )}
        </div>
      ) : (
        !loading && null
      )}

      {(barsWithCoords.length === 0 || barsWithoutCoords.length > 0) && !loading && (
        <div className="stack stack-sm">
          {(barsWithCoords.length === 0 ? bars : barsWithoutCoords).map(bar => {
            const threat = THREAT_CONFIG[bar.threat_level] ?? THREAT_CONFIG.quiet
            return (
              <Link key={bar.bar_id} href={`/turf-wars?bar=${bar.bar_id}`}>
                <div className="card" style={{
                  padding: '14px 16px',
                  borderLeft: `3px solid ${threat.color}`,
                }}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{threat.icon}</span>
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>
                        {bar.bar_name}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: threat.color, padding: '2px 8px', borderRadius: 20,
                      background: `${threat.color}18`,
                    }}>
                      {threat.label}
                    </span>
                  </div>
                  {bar.turf_holder_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span>{bar.turf_holder_type === 'fraternity' ? '♂' : '♀'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--bw-text)' }}>{bar.turf_holder_name}</span>
                      {bar.holder_streak_weeks && bar.holder_streak_weeks > 0 && (
                        <span style={{ color: 'var(--bw-gold)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Flame size={12} /> {bar.holder_streak_weeks}w
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                      {bar.turf_enabled ? 'Unclaimed territory' : 'Turf wars not enabled'}
                    </div>
                  )}
                  {bar.active_shots_count > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--bw-red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Crosshair size={11} />
                      {bar.active_shots_count} shot{bar.active_shots_count > 1 ? 's' : ''} fired
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {!loading && bars.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', padding: '12px 0' }}>
          No bars have enabled turf wars yet.
        </div>
      )}
    </div>
  )
}
