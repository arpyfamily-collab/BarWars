'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'
import { Shield, Phone, Mail, AlertCircle, Check, X, Smartphone, BadgeCheck, Lock, Eye } from 'lucide-react'

interface VerifyStatus {
  profile: { full_name: string; phone: string | null; account_status: string; is_burner: boolean; created_at: string }
  verification: { device_verified: boolean; phone_verified: boolean; edu_verified: boolean; age_verified: boolean }
  devices: { count: number; has_blocked: boolean }
  edu_emails: { id: string; edu_email: string; verified: boolean }[]
  eligibility: string
  high_stakes_ready: boolean
  can_participate: boolean
}

export default function VerificationPage() {
  const [status, setStatus] = useState<VerifyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Phone form
  const [phoneInput, setPhoneInput] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [pendingVerId, setPendingVerId] = useState<string | null>(null)

  // Edu form
  const [eduInput, setEduInput] = useState('')

  async function loadStatus() {
    try {
      const res = await fetch('/api/verify/status')
      const data = await res.json()
      if (data && !data.error) setStatus(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadStatus() }, [])

  async function registerDevice() {
    // Generate a simple device fingerprint from browser properties
    const fingerprint = generateFingerprint()
    setActionLoading('device')
    setError(null)
    try {
      const res = await fetch('/api/verify/device', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: fingerprint }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      loadStatus()
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  async function sendOtp() {
    if (!phoneInput || phoneInput.length < 10) { setError('Enter a valid phone number'); return }
    setActionLoading('send_otp')
    setError(null)
    try {
      const res = await fetch('/api/verify/phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPendingVerId(data.verification_id)
      setResult(`Code sent to ${data.phone}. ${data.dev_otp ? `Dev mode: your code is ${data.dev_otp}` : ''}`)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  async function verifyOtp() {
    if (!otpInput || otpInput.length !== 6) { setError('Enter the 6-digit code'); return }
    if (!pendingVerId) { setError('Request a code first'); return }
    setActionLoading('verify_otp')
    setError(null)
    try {
      const res = await fetch('/api/verify/phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_id: pendingVerId, code: otpInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setPendingVerId(null)
      setOtpInput('')
      setPhoneInput('')
      loadStatus()
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  async function sendEduVerification() {
    if (!eduInput || !eduInput.endsWith('.edu')) { setError('Enter a valid .edu email address'); return }
    setActionLoading('edu')
    setError(null)
    try {
      const res = await fetch('/api/verify/edu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edu_email: eduInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setEduInput('')
      loadStatus()
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  if (loading) return <div className="page"><div className="page-content" style={{ paddingTop: 60 }}><div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Loading…</div></div><BottomNav /></div>

  const v = status?.verification
  const isBlocked = status?.profile.account_status === 'blocked'
  const isFlagged = status?.profile.account_status === 'flagged'

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={26} style={{ color: 'var(--bw-gold)' }} />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.04em' }}>Verification</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Anti-fraud protection. One person, one account, fair play.
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

        {result && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <div style={{ fontSize: 13, color: 'var(--bw-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} />{result}
            </div>
          </div>
        )}

        {/* Account status banner */}
        {isBlocked && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-red)', background: 'rgba(224,49,49,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={16} style={{ color: 'var(--bw-red)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-red)' }}>Account Blocked</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 6 }}>
              Your account has been blocked from event participation due to a violation of anti-fraud rules. Contact support if you believe this is an error.
            </div>
          </div>
        )}

        {isFlagged && !isBlocked && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} style={{ color: 'var(--bw-gold)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-gold)' }}>Account Flagged for Review</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginTop: 6 }}>
              Your account has been flagged. Your check-ins will be reviewed by the platform operator before counting toward headcount. This may happen if your device or phone number was found on multiple accounts.
            </div>
          </div>
        )}

        {/* Eligibility summary */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            Verification Status
          </div>
          <div className="stack stack-sm">
            <VerifyRow icon={<Smartphone size={14} />} label="Device" verified={v?.device_verified ?? false} />
            <VerifyRow icon={<Phone size={14} />} label="Phone" verified={v?.phone_verified ?? false} />
            <VerifyRow icon={<Mail size={14} />} label="University Email" verified={v?.edu_verified ?? false} />
            <VerifyRow icon={<BadgeCheck size={14} />} label="Age" verified={v?.age_verified ?? false} />
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bw-border)', fontSize: 12 }}>
            {status?.high_stakes_ready ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--bw-green)' }}>
                <Check size={14} /> Fully verified — eligible for all roles
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--bw-muted)' }}>
                <AlertCircle size={14} /> Complete all verifications to participate in high-stakes roles
              </div>
            )}
          </div>
        </div>

        {/* Layer 1: Device Fingerprinting */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Smartphone size={16} style={{ color: 'var(--bw-gold)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Layer 1: Device Verification</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            One verified account per device. If someone tries to create a second account from the same device, both accounts get flagged immediately.
          </div>
          {v?.device_verified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bw-green)' }}>
              <Check size={14} /> Device registered and verified ({status?.devices.count} device{status?.devices.count !== 1 ? 's' : ''})
            </div>
          ) : (
            <button className="btn btn-primary" onClick={registerDevice} disabled={actionLoading === 'device'}>
              <Smartphone size={16} /> {actionLoading === 'device' ? 'Registering…' : 'Register This Device'}
            </button>
          )}
          {status?.devices.has_blocked && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--bw-red)' }}>
              One of your devices has been blocked from event participation.
            </div>
          )}
        </div>

        {/* Layer 2: Phone Verification */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Phone size={16} style={{ color: 'var(--bw-gold)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Layer 2: Phone Verification</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            We send a one-time code to your phone. If the same phone number is used on another account, both get flagged. Two phone numbers is rare among college students.
          </div>
          {v?.phone_verified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bw-green)' }}>
              <Check size={14} /> Phone verified: {status?.profile.phone}
            </div>
          ) : pendingVerId ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Enter the 6-digit code</label>
                <input
                  className="input"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  style={{ marginTop: 6, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
                />
              </div>
              <button className="btn btn-primary" onClick={verifyOtp} disabled={actionLoading === 'verify_otp'}>
                <Check size={16} /> {actionLoading === 'verify_otp' ? 'Verifying…' : 'Verify Code'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Your phone number</label>
                <input
                  className="input"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  style={{ marginTop: 6 }}
                />
              </div>
              <button className="btn btn-primary" onClick={sendOtp} disabled={actionLoading === 'send_otp'}>
                <Phone size={16} /> {actionLoading === 'send_otp' ? 'Sending…' : 'Send Verification Code'}
              </button>
            </div>
          )}
        </div>

        {/* Layer 3: .edu Verification */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Mail size={16} style={{ color: 'var(--bw-gold)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Layer 3: University Email (.edu)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Required for high-stakes roles (Greek members, Hessians, Mercenaries). A student can have multiple emails but typically only one .edu address. Ghosts and Allies don&apos;t need this.
          </div>
          {v?.edu_verified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bw-green)' }}>
              <Check size={14} /> University email verified
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Your .edu email</label>
                <input
                  className="input"
                  value={eduInput}
                  onChange={e => setEduInput(e.target.value)}
                  placeholder="you@university.edu"
                  style={{ marginTop: 6 }}
                />
              </div>
              <button className="btn btn-primary" onClick={sendEduVerification} disabled={actionLoading === 'edu'}>
                <Mail size={16} /> {actionLoading === 'edu' ? 'Sending…' : 'Send Verification Link'}
              </button>
            </div>
          )}
          {status?.edu_emails && status.edu_emails.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--bw-muted)' }}>
              Pending: {status.edu_emails.filter(e => !e.verified).map(e => e.edu_email).join(', ')}
            </div>
          )}
        </div>

        {/* Layer 4: Social Graph Anomaly (info only) */}
        <div className="card" style={{ background: 'var(--bw-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Eye size={16} style={{ color: 'var(--bw-muted)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Layer 4: Anomaly Detection (Passive)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.5 }}>
            Accounts that register within 24 hours of an event, have zero social connections (no Regiment links, no org membership), and immediately attempt event participation are flagged as potential burner accounts. Their check-ins go to a review queue before counting toward headcount.
          </div>
          {status?.profile.is_burner && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--bw-gold)' }}>
              Your account has been flagged as a potential burner. Your check-ins will be reviewed before they count.
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

function VerifyRow({ icon, label, verified }: { icon: React.ReactNode; label: string; verified: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--bw-text)' }}>
        {icon}{label}
      </div>
      {verified ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Check size={12} /> Verified
        </span>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bw-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <X size={12} /> Not Verified
        </span>
      )}
    </div>
  )
}

function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? 'unknown',
  ]
  const raw = components.join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'dev_' + Math.abs(hash).toString(36) + '_' + raw.length.toString(36)
}
