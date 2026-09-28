'use client'

/**
 * Sends the player's position every few minutes while the app is open and they've opted in to
 * "Show me on the War Map" (Testing To-Do item 5). The server keeps only which bar they're at.
 * Low-accuracy fixes and a 3-minute interval keep battery use down (item 23); nothing runs while
 * the app is in the background.
 */
import { useEffect } from 'react'

const INTERVAL_MS = 3 * 60 * 1000

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }))
}

export async function reportPosition(): Promise<{ at_bar: string | null } | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null
  const pos = await locate()
  const res = await fetch('/api/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
  })
  return res.ok ? res.json() : null
}

export function LocationReporter() {
  useEffect(() => {
    let enabled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const tick = () => {
      if (!enabled || document.visibilityState !== 'visible') return
      reportPosition().catch(() => {})
    }
    const refresh = async () => {
      try {
        const res = await fetch('/api/location')
        if (!res.ok) { enabled = false; return }
        enabled = !!(await res.json())?.enabled
        tick()
      } catch { enabled = false }
    }

    refresh()
    timer = setInterval(tick, INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('bw-location-changed', refresh)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('bw-location-changed', refresh)
    }
  }, [])
  return null
}
