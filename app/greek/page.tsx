'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type OrgType = 'fraternity' | 'sorority'

export default function GreekOrgPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Create form
  const [orgType, setOrgType] = useState<OrgType>('fraternity')
  const [orgName, setOrgName] = useState('')
  const [chapter, setChapter] = useState('Main')

  // Join form
  const [joinOrgId, setJoinOrgId] = useState('')

  async function createOrg() {
    if (!orgName.trim()) { setError('Org name is required'); return }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/greek-orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_type: orgType,
          name: orgName.trim(),
          chapter: chapter.trim() || 'Main',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`${orgName.trim()} created! You are now the admin.`)
      setMode('menu')
      setOrgName('')
      setChapter('Main')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function joinOrg() {
    if (!joinOrgId.trim()) { setError('Select an org to join'); return }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/greek-orgs/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: joinOrgId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Membership request sent! Your org admin must verify you before you can participate in turf wars.')
      setMode('menu')
      setJoinOrgId('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.04em' }}>Greek Life</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>Claim your turf. Defend your bar.</div>
      </div>

      <div className="page-content">
        {success && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-green)' }}>{success}</div>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)' }}>{error}</div>
          </div>
        )}

        {mode === 'menu' && (
          <>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => { setMode('create'); setError(null) }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 6 }}>Create an Org</div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Register your fraternity or sorority. You become the admin and can verify members.</div>
            </div>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => { setMode('join'); setError(null) }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 6 }}>Join an Org</div>
              <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Request membership in an existing org. Your admin must verify you before you can check in for turf claims.</div>
            </div>
          </>
        )}

        {mode === 'create' && (
          <div className="card">
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 16 }}>Create an Org</div>

            <div style={{ marginBottom: 16 }}>
              <label>Org Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['fraternity', 'sorority'] as OrgType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setOrgType(t)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${orgType === t ? 'var(--bw-gold)' : 'var(--bw-border)'}`,
                      background: orgType === t ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
                      color: orgType === t ? 'var(--bw-gold)' : 'var(--bw-muted)',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {t === 'fraternity' ? 'Fraternity' : 'Sorority'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Org Name</label>
              <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Alpha House, Kappa Manor" />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Chapter (optional)</label>
              <input className="input" value={chapter} onChange={e => setChapter(e.target.value)} placeholder="e.g. Main, Alpha" />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode('menu')} disabled={submitting}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={createOrg} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Org'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <JoinOrgForm
            selectedOrgId={joinOrgId}
            setSelectedOrgId={setJoinOrgId}
            onJoin={joinOrg}
            onBack={() => setMode('menu')}
            submitting={submitting}
          />
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function JoinOrgForm({
  selectedOrgId, setSelectedOrgId, onJoin, onBack, submitting,
}: {
  selectedOrgId: string
  setSelectedOrgId: (v: string) => void
  onJoin: () => void
  onBack: () => void
  submitting: boolean
}) {
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; org_type: string; chapter: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/greek-orgs')
      .then(r => r.json())
      .then(d => { setOrgs(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="card" style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading orgs…</div>

  return (
    <div className="card">
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 16 }}>Join an Org</div>

      {orgs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 16 }}>
          No orgs have been registered yet. Create one first!
        </div>
      ) : (
        <div className="stack stack-sm" style={{ marginBottom: 20 }}>
          {orgs.map(org => (
            <div
              key={org.id}
              onClick={() => setSelectedOrgId(org.id)}
              style={{
                background: selectedOrgId === org.id ? 'rgba(245,184,0,0.1)' : 'var(--bw-surface)',
                border: `1px solid ${selectedOrgId === org.id ? 'var(--bw-gold)' : 'var(--bw-border)'}`,
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15 }}>{org.name}</div>
              <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                {org.org_type === 'fraternity' ? 'Fraternity' : 'Sorority'} · {org.chapter}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onBack} disabled={submitting}>Back</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onJoin} disabled={submitting || !selectedOrgId}>
          {submitting ? 'Sending…' : 'Request to Join'}
        </button>
      </div>
    </div>
  )
}
