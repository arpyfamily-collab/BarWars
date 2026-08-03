'use client'
/**
 * /ambassador
 *
 * Student ambassador dashboard. Shows:
 *   - Personal referral QR code + shareable link
 *   - Current tier + progress to next tier
 *   - Earnings breakdown (credit balance, pending, lifetime)
 *   - L1 and L2 referral counts
 *   - Chapter leaderboard (if affiliated)
 *   - Compensation history (passes, drink credits)
 */

import { useEffect, useState } from 'react'
import { generateQRDataURL } from '@/lib/qr'
import BottomNav from '@/components/BottomNav'

const TIERS = [
  { key: 'scout',   label: 'Scout',   min: 0,  max: 4,  commission: '5%',  perks: '$1 credit per referral' },
  { key: 'soldier', label: 'Soldier', min: 5,  max: 14, commission: '8%',  perks: '$2 credit + 1 free pass/month' },
  { key: 'captain', label: 'Captain', min: 15, max: 29, commission: '12%', perks: '$5 credit + 2 passes/month' },
  { key: 'general', label: 'General', min: 30, max: Infinity, commission: '15%', perks: 'Drink credit + priority lane' },
]

const TIER_COLORS: Record<string, string> = {
  scout:   'var(--bw-muted)',
  soldier: '#378ADD',
  captain: 'var(--bw-gold)',
  general: '#E24B4A',
}

interface AmbassadorData {
  id:                     string
  referral_code:          string
  tier:                   string
  lifetime_referrals:     number
  lifetime_l2_referrals:  number
  lifetime_revenue:       number
  credit_balance_cents:   number
  passes_earned:          number
  chapter_name:           string | null
  chapter_code:           string | null
}

interface Compensation {
  id:          string
  type:        string
  amount_cents: number
  description: string
  issued_at:   string
  redeemed:    boolean
}

export default function AmbassadorPage() {
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null)
  const [comp,       setComp]       = useState<Compensation[]>([])
  const [qrUrl,      setQrUrl]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [enrolling,  setEnrolling]  = useState(false)
  const [chapter,    setChapter]    = useState('')
  const [copied,     setCopied]     = useState(false)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://barwars.app'

  async function load() {
    const res  = await fetch('/api/ambassador/me')
    const data = await res.json()
    if (data.ambassador) {
      setAmbassador(data.ambassador)
      setComp(data.compensation ?? [])
      const url = `${appUrl}/?ref=${data.ambassador.referral_code}`
      generateQRDataURL(url).then(setQrUrl)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function enroll() {
    setEnrolling(true)
    const res  = await fetch('/api/ambassador/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chapter_name: chapter || null }),
    })
    const data = await res.json()
    if (data.ambassador) {
      setAmbassador(data.ambassador)
      const url = `${appUrl}/?ref=${data.ambassador.referral_code}`
      generateQRDataURL(url).then(setQrUrl)
    }
    setEnrolling(false)
  }

  async function copyLink() {
    if (!ambassador) return
    await navigator.clipboard.writeText(`${appUrl}/?ref=${ambassador.referral_code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    if (!ambassador) return
    const url = `${appUrl}/?ref=${ambassador.referral_code}`
    if (navigator.share) {
      await navigator.share({ title: 'BarWars', text: "I'm an official BarWars ambassador. Use my link for your passes tonight.", url })
    } else {
      copyLink()
    }
  }

  const currentTier = TIERS.find(t => t.key === ambassador?.tier) ?? TIERS[0]
  const nextTier    = TIERS[TIERS.findIndex(t => t.key === ambassador?.tier) + 1]
  const tierColor   = TIER_COLORS[ambassador?.tier ?? 'scout']
  const progressPct = nextTier
    ? Math.min(100, Math.round(((ambassador?.lifetime_referrals ?? 0) - currentTier.min) / (nextTier.min - currentTier.min) * 100))
    : 100

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
      Loading…
    </div>
  )

  if (!ambassador) return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Ambassador</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>Become an official BarWars rep</div>
      </div>
      <div className="page-content">
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Join the program</div>
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Get a personal referral code. Every friend who buys a pass using your link earns you credit at the bar — free passes, drink credits, and more as you level up.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Greek chapter (optional)</label>
            <input className="input" style={{ marginTop: 4 }} placeholder="e.g. Kappa Delta" value={chapter} onChange={e => setChapter(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={enroll} disabled={enrolling}>
            {enrolling ? 'Enrolling…' : 'Become an ambassador'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 10, textAlign: 'center' }}>
            Max 2-level referral program. Rewards are bar credit and perks — not cash. See terms.
          </div>
        </div>

        {/* Tier preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            The tiers
          </div>
          <div className="stack stack-sm">
            {TIERS.map(t => (
              <div key={t.key} className="card" style={{ padding: '12px 16px', borderColor: TIER_COLORS[t.key] + '33' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: TIER_COLORS[t.key], letterSpacing: '0.04em' }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{t.min === 0 ? '0' : `${t.min}`}{t.max === Infinity ? '+' : `–${t.max}`} referrals · {t.commission}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>{t.perks}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  )

  const referralUrl = `${appUrl}/?ref=${ambassador.referral_code}`

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>Ambassador</div>
            {ambassador.chapter_name && (
              <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 2 }}>{ambassador.chapter_name}</div>
            )}
          </div>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.06em',
            color: tierColor, padding: '4px 12px',
            background: tierColor + '18', borderRadius: 20,
            border: `1px solid ${tierColor}44`,
          }}>
            {currentTier.label}
          </div>
        </div>
      </div>

      <div className="page-content">

        {/* QR code */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Your referral code
          </div>
          {qrUrl && (
            <div className="qr-container" style={{ marginBottom: 12 }}>
              <img src={qrUrl} alt="Referral QR" width={220} height={220} />
            </div>
          )}
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.12em', color: 'var(--bw-gold)', marginBottom: 12 }}>
            {ambassador.referral_code}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={share} style={{ flex: 1, fontSize: 13 }}>
              Share link
            </button>
            <button className="btn btn-ghost" onClick={copyLink} style={{ flex: 1, fontSize: 13 }}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 8 }}>
            Friends get your code's perks. You get commission.
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Direct referrals', value: ambassador.lifetime_referrals, color: tierColor },
            { label: 'L2 referrals', value: ambassador.lifetime_l2_referrals, color: 'var(--bw-muted)' },
            { label: 'Credit balance', value: `$${(ambassador.credit_balance_cents / 100).toFixed(2)}`, color: 'var(--bw-green)' },
            { label: 'Revenue driven', value: `$${(ambassador.lifetime_revenue / 100).toFixed(0)}`, color: 'var(--bw-text)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: s.color, lineHeight: 1, marginBottom: 4 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tier progress */}
        {nextTier && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--bw-text)', fontWeight: 600 }}>
                Progress to {nextTier.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--bw-muted)' }}>
                {ambassador.lifetime_referrals}/{nextTier.min} referrals
              </span>
            </div>
            <div className="capacity-track">
              <div className="capacity-fill low" style={{ width: `${progressPct}%`, background: tierColor }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 8 }}>
              {nextTier.min - ambassador.lifetime_referrals} more to unlock: {nextTier.perks}
            </div>
          </div>
        )}

        {/* Compensation history */}
        {comp.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
              Rewards
            </div>
            <div className="stack stack-sm">
              {comp.map(c => (
                <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--bw-text)', fontWeight: 600 }}>
                      {c.type === 'pass_credit' ? '🎟️' : c.type === 'drink_credit' ? '🍺' : '🎁'} ${(c.amount_cents / 100).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginTop: 2 }}>{c.description}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.redeemed ? 'var(--bw-muted)' : 'var(--bw-green)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {c.redeemed ? 'Used' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
