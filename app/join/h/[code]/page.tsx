'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Skull, Check, AlertCircle, Loader2 } from 'lucide-react'

interface Preview {
  valid: boolean
  reason: string | null
  company_name?: string
  captain_name?: string
  member_count?: number
  reputation?: number
  already_member?: boolean
  is_captain?: boolean
  in_other_company?: boolean
}

/** Hessian company invite (Testing To-Do item 2). Signed-out visitors are sent to sign up first
 *  by the sign-in gate, which brings them back here afterwards. */
export default function JoinHessianPage({ params }: { params: { code: string } }) {
  const router = useRouter()
  const [p, setP] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    fetch(`/api/turf-wars/hessians/invite?code=${encodeURIComponent(params.code)}`)
      .then(r => r.json())
      .then(d => setP(d?.error ? { valid: false, reason: d.error } : d))
      .catch(() => setP({ valid: false, reason: 'Could not load this invite. Try again.' }))
  }, [params.code])

  async function join() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/turf-wars/hessians/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: params.code, action: 'join' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setJoined(true)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="card" style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>{children}</div>
  )

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '0 20px' }}>
      {!p ? (
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--bw-muted)' }} />
      ) : (
        <Card>
          <Skull size={34} style={{ color: 'var(--bw-gold)', margin: '0 auto' }} />
          {p.company_name && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Hessian company invite</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>{p.company_name}</div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                {p.captain_name} invited you · {p.member_count} member{p.member_count === 1 ? '' : 's'}
              </div>
            </div>
          )}

          {joined || p.already_member ? (
            <>
              <div style={{ fontSize: 14, color: 'var(--bw-green)', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                <Check size={16} /> {joined ? `You're in ${p.company_name}.` : `You're already in ${p.company_name}.`}
              </div>
              <button className="btn btn-primary" onClick={() => router.push('/turf-wars/hessians')}>Go to the Hessians</button>
            </>
          ) : p.is_captain ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>This is your own invite link. Share it with friends so they can join.</div>
              <button className="btn btn-ghost" onClick={() => router.push('/turf-wars/hessians')}>Back to the Hessians</button>
            </>
          ) : !p.valid ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', gap: 6, justifyContent: 'center' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {p.reason}
              </div>
              <button className="btn btn-ghost" onClick={() => router.push('/turf-wars/hessians')}>Browse Hessian companies</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.6 }}>
                Hessians are hired guns: Greek orgs pay them to fight their Turf Wars, and they ambush Greek turf.
                {p.in_other_company ? " You're in another company, so you'd need to leave it first." : ''}
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--bw-red)' }}>{error}</div>}
              <button className="btn btn-primary" onClick={join} disabled={busy}>
                {busy ? 'Joining…' : `Join ${p.company_name}`}
              </button>
              <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>Greek org members can&apos;t be Hessians.</div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
