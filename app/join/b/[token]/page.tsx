'use client'

/** A bar's private staff invite (item 11). Not linked anywhere in the app. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StaffInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function accept() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/bar-staff/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.token }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error || "This link isn't valid."); return }
    router.push(j.kind === 'door' ? '/door' : '/turf-wars/spies')
  }
  return (
    <div className="page"><div className="page-content" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 48 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.04em' }}>You&apos;re in.</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', margin: '8px 0 16px' }}>Accept to finish setting up your account. Keep this link to yourself.</div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={accept}>{busy ? 'Accepting…' : 'Accept'}</button>
        {msg && <div style={{ fontSize: 13, color: 'var(--bw-red)', marginTop: 12 }}>{msg}</div>}
      </div>
    </div></div>
  )
}
