'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Flame, Shield, Crosshair, Zap, X, ChevronRight, Eye, EyeOff } from 'lucide-react'
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

interface RadarUser {
  user_id: string
  display_name: string
  lat: number
  lng: number
  skin_name: string
  skin_category: string
  skin_icon_url: string | null
  skin_rarity: string
  status: string
  is_deception: boolean
  updated_at: string
}

interface Cluster {
  lat: number
  lng: number
  users: RadarUser[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OXFORD_CENTER: [number, number] = [-89.5187, 34.3668]
const WAR_ZONE_CENTER: [number, number] = [-89.5193, 34.3663]
const WAR_ZONE_RADIUS_M = 300

const THREAT_CONFIG = {
  quiet:         { label: 'Quiet',         color: '#2ECC71', pulse: false, icon: '🛡' },
  tense:         { label: 'Tense',         color: '#F5B800', pulse: false, icon: '⚡' },
  shots_fired:   { label: 'Shots Fired',   color: '#E03131', pulse: true,  icon: '🔥' },
  active_attack: { label: 'Active Attack', color: '#E03131', pulse: true,  icon: '⚔️' },
  flare:         { label: 'Flare Active',   color: '#F5B800', pulse: true,  icon: '⚡' },
} as const

const SKIN_CATEGORY_COLORS: Record<string, string> = {
  status:     '#8B9BB4',
  squad:      '#7B2CBF',
  deception:  '#7B2CBF',
  earned:     '#F5B800',
  seasonal:   '#C9A84C',
}

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

// ── Radar dot SVG factory ─────────────────────────────────────────────────────

function buildRadarDotSVG(color: string, pulsing: boolean, rallying: boolean): string {
  const glow = pulsing ? '0.6' : '0.3'
  const pulseClass = pulsing ? 'radar-dot-pulse' : ''
  const dots = rallying ? `
    <circle cx="4" cy="9" r="2" fill="${color}" opacity="0.3"/>
    <circle cx="8" cy="9" r="2" fill="${color}" opacity="0.5"/>
  ` : ''
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="18" viewBox="0 0 20 18" class="${pulseClass}">
      ${dots}
      <circle cx="14" cy="9" r="6" fill="${color}" opacity="${glow}"/>
      <circle cx="14" cy="9" r="4" fill="${color}"/>
      <circle cx="14" cy="9" r="2.5" fill="#0D1117" opacity="0.3"/>
    </svg>
  `
}

function buildClusterSVG(count: number, color: string): string {
  const digits = String(count).length
  const fontSize = digits > 1 ? 10 : 12
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="13" fill="${color}" opacity="0.15"/>
      <circle cx="14" cy="14" r="10" fill="${color}" opacity="0.4"/>
      <circle cx="14" cy="14" r="9" fill="#13171F" stroke="${color}" stroke-width="1.5"/>
      <text x="14" y="15" text-anchor="middle" font-size="${fontSize}" font-weight="700"
            fill="${color}" dominant-baseline="middle">${count}</text>
    </svg>
  `
}

// ── Clustering ───────────────────────────────────────────────────────────────

function clusterUsers(users: RadarUser[], thresholdM: number): Array<RadarUser | Cluster> {
  const visited = new Set<number>()
  const result: Array<RadarUser | Cluster> = []

  for (let i = 0; i < users.length; i++) {
    if (visited.has(i)) continue
    const cluster: RadarUser[] = [users[i]]
    visited.add(i)

    for (let j = i + 1; j < users.length; j++) {
      if (visited.has(j)) continue
      const dist = haversine(users[i].lat, users[i].lng, users[j].lat, users[j].lng)
      if (dist < thresholdM) {
        cluster.push(users[j])
        visited.add(j)
      }
    }

    if (cluster.length === 1) {
      result.push(cluster[0])
    } else {
      const avgLat = cluster.reduce((s, u) => s + u.lat, 0) / cluster.length
      const avgLng = cluster.reduce((s, u) => s + u.lng, 0) / cluster.length
      result.push({ lat: avgLat, lng: avgLng, users: cluster })
    }
  }

  return result
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function dominantCategory(users: RadarUser[]): string {
  const counts: Record<string, number> = {}
  for (const u of users) {
    const cat = u.skin_category === 'deception' ? 'squad' : u.skin_category
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  let max = 0
  let result = 'squad'
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { max = v; result = k }
  }
  return result
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

    @keyframes radar-dot-pulse {
      0%   { transform: scale(1);   opacity: 1; }
      50%  { transform: scale(1.3); opacity: 0.7; }
      100% { transform: scale(1);   opacity: 1; }
    }
    .radar-dot-pulse { animation: radar-dot-pulse 1.2s ease-in-out infinite; transform-origin: 14px 9px; }

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

    .radar-tooltip {
      position: absolute;
      background: rgba(13,17,23,0.95);
      border: 1px solid #2A3350;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      color: #F0F0F0;
      pointer-events: none;
      white-space: nowrap;
      z-index: 20;
      transform: translate(-50%, -100%);
      margin-top: -8px;
    }
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
        position: 'absolute', inset: 0, zIndex: 30,
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
          <button onClick={onClose} style={{ background: '#1C2333', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8B9BB4' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ background: '#0D1117', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          {bar.turf_holder_name ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{bar.turf_holder_type === 'fraternity' ? '♂' : '♀'}</span>
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

// ── Cluster Sheet ────────────────────────────────────────────────────────────

function ClusterSheet({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(0,0,0,0.45)', borderRadius: 16,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="turf-sheet-enter" style={{
        width: '100%', background: '#13171F',
        borderTop: '2px solid #7B2CBF',
        borderRadius: '16px 16px 0 0', padding: '20px 20px 28px',
        maxHeight: '60%', overflow: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: '#2A3350', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-violet-soft)', marginBottom: 12 }}>
          {cluster.users.length} soldiers at this position
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cluster.users.map(u => {
            const color = SKIN_CATEGORY_COLORS[u.skin_category] ?? '#8B9BB4'
            return (
              <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0D1117', borderRadius: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0' }}>{u.display_name}</div>
                  <div style={{ fontSize: 11, color: '#8B9BB4' }}>{u.skin_name}</div>
                </div>
                <span style={{ fontSize: 10, color: '#8B9BB4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{u.status.replace(/_/g, ' ')}</span>
              </div>
            )
          })}
        </div>
        <button onClick={onClose} style={{
          width: '100%', marginTop: 14, padding: '10px',
          background: '#1C2333', border: 'none', borderRadius: 8,
          color: '#8B9BB4', fontSize: 13, cursor: 'pointer',
        }}>Close</button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TurfMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<mapboxgl.Marker[]>([])
  const radarMarkersRef = useRef<mapboxgl.Marker[]>([])

  const [bars, setBars]           = useState<BarTurf[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedBar, setSelectedBar] = useState<BarTurf | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [mapReady, setMapReady]   = useState(false)
  const [radarUsers, setRadarUsers] = useState<RadarUser[]>([])
  const [radarVisible, setRadarVisible] = useState(true)

  // Load radar visibility preference
  useEffect(() => {
    const pref = typeof window !== 'undefined' ? localStorage.getItem('radar-visible') : null
    if (pref !== null) setRadarVisible(pref === 'true')
  }, [])

  const toggleRadar = () => {
    const next = !radarVisible
    setRadarVisible(next)
    if (typeof window !== 'undefined') localStorage.setItem('radar-visible', String(next))
  }

  const fetchBars = useCallback(() => {
    fetch('/api/turf-wars/map')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setBars(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const fetchRadar = useCallback(() => {
    fetch('/api/radar/live')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setRadarUsers(d)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchBars()
    const barInterval = setInterval(fetchBars, 60_000)
    return () => clearInterval(barInterval)
  }, [fetchBars])

  useEffect(() => {
    fetchRadar()
    const radarInterval = setInterval(fetchRadar, 15_000)
    return () => clearInterval(radarInterval)
  }, [fetchRadar])

  // Reinforcements alert: 5+ users with same squad skin rallying
  useEffect(() => {
    if (!radarVisible || radarUsers.length === 0) return
    const rallying = radarUsers.filter(u => u.status === 'rallying')
    if (rallying.length < 5) return

    const bySkin: Record<string, RadarUser[]> = {}
    for (const u of rallying) {
      const key = u.skin_name
      if (!bySkin[key]) bySkin[key] = []
      bySkin[key].push(u)
    }

    for (const [, users] of Object.entries(bySkin)) {
      if (users.length >= 5) {
        if (typeof window !== 'undefined' && (window as any).__radarAlert) {
          ;(window as any).__radarAlert(`Reinforcements incoming — ${users.length} soldiers in ${users[0].skin_name} approaching the Square`)
        }
        break
      }
    }
  }, [radarUsers, radarVisible])

  const barsWithCoords    = bars.filter(b => b.lat != null && b.lng != null)
  const barsWithoutCoords = bars.filter(b => b.lat == null || b.lng == null)

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
      style: 'mapbox://styles/mapbox/dark-v11',
      center: OXFORD_CENTER,
      zoom: 16,
      pitch: 45,
      bearing: -10,
      interactive: true,
      attributionControl: false,
    })

    map.on('load', () => {
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', '#080B0F')
      }

      map.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 14,
        'paint': {
          'fill-extrusion-color': '#1a1f2e',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.7
        }
      })

      // War zone boundary circle
      if (!map.getSource('war-zone')) {
        const circlePoints: [number, number][] = []
        const steps = 64
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * 2 * Math.PI
          const dx = (WAR_ZONE_RADIUS_M / 111320) * Math.cos(angle)
          const dy = (WAR_ZONE_RADIUS_M / (111320 * Math.cos(WAR_ZONE_CENTER[1] * Math.PI / 180))) * Math.sin(angle)
          circlePoints.push([WAR_ZONE_CENTER[0] + dx, WAR_ZONE_CENTER[1] + dy])
        }

        map.addSource('war-zone', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [circlePoints] },
            properties: {},
          } as any,
        })

        map.addLayer({
          id: 'war-zone-fill',
          type: 'fill',
          source: 'war-zone',
          paint: {
            'fill-color': '#7B2CBF',
            'fill-opacity': 0.06,
          },
        })

        map.addLayer({
          id: 'war-zone-border',
          type: 'line',
          source: 'war-zone',
          paint: {
            'line-color': '#7B2CBF',
            'line-opacity': 0.3,
            'line-width': 1.5,
            'line-dasharray': [3, 2],
          },
        })
      }

      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [barsWithCoords.length])

  // Render bar pins
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
      el.style.cssText = 'width:52px;cursor:pointer;display:flex;flex-direction:column;align-items:center;'
      if (threat.pulse) el.classList.add('turf-pin-pulse')
      el.innerHTML = svg

      const label = document.createElement('div')
      const barName = bar.bar_name.length > 20 ? bar.bar_name.slice(0, 20) + '…' : bar.bar_name
      label.textContent = barName
      label.style.cssText = 'font-size:10px;color:#F0F0F0;font-weight:700;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;margin-top:-4px;'
      el.appendChild(label)

      el.addEventListener('click', () => setSelectedBar(bar))

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([bar.lng!, bar.lat!])
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [bars, mapReady])

  // Render radar dots
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear previous radar markers
    radarMarkersRef.current.forEach(m => m.remove())
    radarMarkersRef.current = []

    if (!radarVisible || radarUsers.length === 0) return

    const clustered = clusterUsers(radarUsers, 20)

    for (const item of clustered) {
      if ('users' in item) {
        // Cluster marker
        const domCat = dominantCategory(item.users)
        const color = SKIN_CATEGORY_COLORS[domCat] ?? '#7B2CBF'
        const el = document.createElement('div')
        el.style.cssText = 'width:28px;height:28px;cursor:pointer;'
        el.innerHTML = buildClusterSVG(item.users.length, color)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelectedCluster(item)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([item.lng, item.lat])
          .addTo(map)
        radarMarkersRef.current.push(marker)
      } else {
        // Single user dot
        const color = SKIN_CATEGORY_COLORS[item.skin_category] ?? '#8B9BB4'
        const isPulsing = item.status === 'in_battle'
        const isRallying = item.status === 'rallying'
        const el = document.createElement('div')
        el.style.cssText = `width:20px;height:18px;pointer-events:auto;`
        el.innerHTML = buildRadarDotSVG(color, isPulsing, isRallying)

        // Tooltip on hover
        const tooltip = document.createElement('div')
        tooltip.className = 'radar-tooltip'
        tooltip.textContent = `${item.skin_name} — ${item.display_name}`
        tooltip.style.display = 'none'
        el.appendChild(tooltip)

        el.addEventListener('mouseenter', () => { tooltip.style.display = 'block' })
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([item.lng, item.lat])
          .addTo(map)
        radarMarkersRef.current.push(marker)
      }
    }
  }, [radarUsers, radarVisible, mapReady])

  return (
    <div style={{ paddingBottom: 8 }}>

      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>War Map</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {radarVisible && radarUsers.length > 0 && (
            <span style={{ color: '#7B2CBF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7B2CBF', display: 'inline-block',
                animation: 'radar-dot-pulse 1.2s ease-in-out infinite' }} />
              {radarUsers.length} LIVE
            </span>
          )}
          {bars.some(b => b.threat_level === 'active_attack' || b.threat_level === 'shots_fired') && (
            <span style={{ color: '#E03131', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E03131', display: 'inline-block',
                animation: 'turf-pulse 1.4s ease-in-out infinite' }} />
              LIVE ACTION
            </span>
          )}
        </div>
      </div>

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
          display: barsWithCoords.length > 0 || loading ? 'block' : 'none',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Radar toggle button */}
        <button
          onClick={toggleRadar}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 15,
            background: 'rgba(13,17,23,0.9)', border: '1px solid #2A3350',
            borderRadius: 8, padding: 6, cursor: 'pointer',
            color: radarVisible ? '#7B2CBF' : '#8B9BB4',
            display: 'flex', alignItems: 'center',
          }}
          title={radarVisible ? 'Hide radar' : 'Show radar'}
        >
          {radarVisible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

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
          {Object.entries(THREAT_CONFIG).filter(([key]) => key !== 'flare').map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#8B9BB4' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
              {cfg.label}
            </div>
          ))}
          {radarVisible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#8B9BB4', marginTop: 2, paddingTop: 4, borderTop: '1px solid #2A3350' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7B2CBF', flexShrink: 0 }} />
              Live Radar
            </div>
          )}
        </div>

        {selectedBar && (
          <BarSheet bar={selectedBar} onClose={() => setSelectedBar(null)} />
        )}

        {selectedCluster && (
          <ClusterSheet cluster={selectedCluster} onClose={() => setSelectedCluster(null)} />
        )}
      </div>

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
