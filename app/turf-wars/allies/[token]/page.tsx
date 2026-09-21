'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { UserPlus, Copy, Check, Users, AlertCircle, Zap } from 'lucide-react'

export default function AllySignupPage() {
  const params = useParams()
  const router = useRouter()
  const token = (params.token as string) ?? ''

  const [invite, setInvite] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [university, setUniversity] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [greekStatus, setGreekStatus] = useState<'member' | 'rush' | 'unaffiliated'>('unaffiliated')
  const [nationalBrother, setNationalBrother] = useState(false)

  useEffect(() => {
    fetch(`/api/turf-wars/allies/invite?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error)
          setLoading(false)
        } else {
          setInvite(d)
          setLoading(false)
        }
      })
      .catch(() => { setError('Failed to load invite'); setLoading(false) })
  }, [token])

  async function submitSignup() {
    if (!name) { setError('Name is required'); return }
    if (!email) { setError('Email is required'); return }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/turf-wars/allies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_token: token,
          name,
          email,
          university: university || undefined,
          graduation_year: graduationYear ? parseInt(graduationYear) : undefined,
          greek_status: greekStatus,
          national_brother: nationalBrother,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  if (success) {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Check size={28} style={{ color: 'var(--bw-green)' }} />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>You're In</div>
          </div>
        </div>
        <div className="page-content">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{invite?.org?.org_type === 'fraternity' ? '♂' : '♀'}</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.04em', marginBottom: 8 }}>
              {invite?.org?.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 20 }}>
              You're now an ally{nationalBrother ? ' (National Brother)' : ''}. Your check-ins count at {nationalBrother ? '0.75x' : '0.5x'} weight.
              {invite?.claim && ` Head to ${invite.claim?.bar?.name ?? 'the bar'} and check in during the battle window.`}
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/turf-wars')}>
              Go to Turf Wars
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserPlus size={24} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, letterSpacing: '0.04em' }}>Join as Ally</div>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}

        {/* Org info */}
        {invite && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{invite.org?.org_type === 'fraternity' ? '♂' : '♀'}</span>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>{invite.org?.name}</span>
            </div>
            {invite.claim?.bar?.name && (
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
                Event: {invite.claim.bar.name}
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            How Ally Check-ins Work
          </div>
          <div className="stack stack-sm" style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.6 }}>
            <div>Full org members count as 1.0x headcount per check-in.</div>
            <div>Allies count as 0.5x — you can help but can't carry the org alone.</div>
            <div>National brothers (same fraternity, different school) count as 0.75x.</div>
          </div>
        </div>

        {/* Signup form */}
        <div>
          <label>Full Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" />
        </div>
        <div>
          <label>University (optional)</label>
          <input className="input" value={university} onChange={e => setUniversity(e.target.value)} placeholder="e.g. Ole Miss, Alabama" />
        </div>
        <div>
          <label>Graduation Year (optional)</label>
          <input className="input" type="number" value={graduationYear} onChange={e => setGraduationYear(e.target.value)} placeholder="2028" min={2024} max={2030} />
        </div>

        <div>
          <label>Greek Affiliation Status</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['unaffiliated', 'rush', 'member'] as const).map(status => (
              <button
                key={status}
                onClick={() => setGreekStatus(status)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: greekStatus === status ? 'rgba(245,184,0,0.15)' : 'var(--bw-surface)',
                  color: greekStatus === status ? 'var(--bw-gold)' : 'var(--bw-muted)',
                  border: `1px solid ${greekStatus === status ? 'rgba(245,184,0,0.3)' : 'var(--bw-border)'}`,
                  textTransform: 'capitalize',
                }}
              >{status}</button>
            ))}
          </div>
        </div>

        {/* National brother toggle */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>National Brother</div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                Same fraternity, different university chapter? Get 0.75x weight instead of 0.5x.
              </div>
            </div>
            <button
              onClick={() => setNationalBrother(!nationalBrother)}
              style={{
                width: 50, height: 28, borderRadius: 14,
                background: nationalBrother ? 'var(--bw-gold)' : 'var(--bw-border)',
                border: 'none', cursor: 'pointer', position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: nationalBrother ? 25 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={submitSignup} disabled={submitting}>
          <UserPlus size={18} />
          {submitting ? 'Signing up…' : 'Join as Ally'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
