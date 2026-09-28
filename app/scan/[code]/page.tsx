'use client'

/** Where a bar's door QR (or, later, an NFC tag) lands: check in at full strength for a live war there. */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ScanPage({ params }: { params: { code: string } }) {
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/turf-wars/scan?code=${encodeURIComponent(params.code)}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setMsg(j.error || 'Not a BarWars code'); else setD(j)
    })
  }, [params.code])

  async function checkIn(warId: string) {
    setBusy(true); setMsg(null)
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }))
      const r = await fetch('/api/turf-wars/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: warId, bar_id: d.bar.id, method: 'qr_scan', code: params.code, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Check-in failed')
      router.push(`/turf-wars/${warId}`)
    } catch (e: any) {
      setMsg(e?.code === 1 ? 'Turn on location to check in: you need to be at the bar.' : e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="page"><div className="page-content" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 32 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, letterSpacing: '0.04em' }}>{d?.bar?.name ?? 'BarWars'}</div>
        {d && d.wars.length === 0 && <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 8 }}>No war is live here right now.</div>}
        {d?.wars.map((w: any) => (
          <button key={w.id} className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={() => checkIn(w.id)}>
            {busy ? 'Checking in…' : `Check in: ${w.attacker ?? 'Attacker'} vs ${w.defender ?? 'the bar'}`}
          </button>
        ))}
        {msg && <div style={{ fontSize: 13, color: 'var(--bw-red)', marginTop: 12 }}>{msg}</div>}
      </div>
    </div></div>
  )
}
