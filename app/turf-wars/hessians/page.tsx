'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Skull, UserPlus, AlertCircle, Check, Users, Crosshair, Shield } from 'lucide-react'

interface Company {
  id: string
  name: string
  member_count: number
  reputation_score: number
  betrayals: number
  contracts_completed: number
  ambushes_won: number
  created_at: string
}

export default function HessiansPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/turf-wars/hessians')
      .then(r => r.json())
      .then(d => { setCompanies(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function createCompany() {
    if (!companyName) { setError('Company name is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/turf-wars/hessians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Company "${companyName}" created! You are the Captain.`)
      setShowCreate(false)
      setCompanyName('')
      // Refresh list
      fetch('/api/turf-wars/hessians')
        .then(r => r.json())
        .then(d => setCompanies(Array.isArray(d) ? d : []))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skull size={26} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.04em' }}>The Hessians</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>Independent mercenary factions. No loyalty. No mercy.</div>
      </div>

      <div className="page-content">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />{error}
            </div>
          </div>
        )}
        {success && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} />{success}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            What Hessians Do
          </div>
          <div className="stack stack-sm" style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={13} style={{ color: '#E03131' }} />
              <span><b>Ambush</b> — Attack vulnerable Greek turf. Success puts it in Contested Status for 72 hours.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={13} style={{ color: 'var(--bw-gold)' }} />
              <span><b>Contracts</b> — Greek orgs hire you for events. You check in at 0.75x weight.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Skull size={13} style={{ color: 'var(--bw-red)' }} />
              <span><b>Double Cross</b> — Take a contract, then secretly fight for the rival. Your reputation drops permanently.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} style={{ color: 'var(--bw-text)' }} />
              <span><b>Occupation</b> — Occupy neutral bars for 7 days. Get a Hessian Special discount.</span>
            </div>
          </div>
        </div>

        {/* Create company */}
        {!showCreate ? (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Skull size={18} />
            Form a Company
          </button>
        ) : (
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
              Register Your Company
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Company Name</label>
              <input
                className="input"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. The Fallen Monks, Tuesday Wrecking Crew"
                maxLength={40}
              />
              <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 4 }}>
                You become the Captain. Must be non-Greek (no verified org membership). Minimum 5 members to act.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={createCompany} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Company'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setCompanyName('') }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Company directory */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Companies — Ranked by Reputation
          </div>
          <div className="stack stack-sm">
            {companies.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--bw-muted)', fontSize: 13 }}>
                No companies registered yet. Be the first.
              </div>
            ) : companies.map((comp, i) => {
              const rep = comp.reputation_score
              const repColor = rep > 10 ? 'var(--bw-green)' : rep < -5 ? 'var(--bw-red)' : rep < 0 ? '#F5B800' : 'var(--bw-text)'
              return (
                <div key={comp.id} className="card" style={{ borderLeft: i < 3 ? `3px solid ${i === 0 ? 'var(--bw-gold)' : i === 1 ? '#C0C0C0' : '#CD7F32'}` : 'var(--bw-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: i === 0 ? 'var(--bw-gold)' : 'var(--bw-muted)', minWidth: 24 }}>
                        #{i + 1}
                      </span>
                      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.04em' }}>{comp.name}</span>
                    </div>
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: repColor }}>
                      {rep > 0 ? '+' : ''}{rep}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--bw-muted)' }}>
                    <span>{comp.member_count} members</span>
                    <span style={{ color: 'var(--bw-green)' }}>{comp.contracts_completed} contracts</span>
                    {comp.betrayals > 0 && (
                      <span style={{ color: 'var(--bw-red)' }}>{comp.betrayals} betrayals</span>
                    )}
                    {comp.ambushes_won > 0 && (
                      <span style={{ color: '#E03131' }}>{comp.ambushes_won} ambushes</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
