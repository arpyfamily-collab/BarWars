'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/account'

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push(next)
    })
  }, [router, next, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a complete email address, such as you@example.com.')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { age_confirmed_18: true } },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        setSignupSuccess(true)
        setLoading(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push(next)
      }
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '0 20px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 48,
            letterSpacing: '0.04em', lineHeight: 1, color: 'var(--bw-gold)',
          }}>
            BarWars
          </div>
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 6 }}>
            Skip the line. Own the night.
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--bw-border)', marginBottom: 24 }}>
          <button
            onClick={() => setMode('signin')}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: mode === 'signin' ? '2px solid var(--bw-gold)' : '2px solid transparent',
              color: mode === 'signin' ? 'var(--bw-gold)' : 'var(--bw-muted)',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: mode === 'signup' ? '2px solid var(--bw-gold)' : '2px solid transparent',
              color: mode === 'signup' ? 'var(--bw-gold)' : 'var(--bw-muted)',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: 'var(--bw-red)', background: 'rgba(224,49,49,0.1)',
              border: '1px solid rgba(224,49,49,0.3)', borderRadius: 8, padding: '10px 12px',
            }}>
              {error}
            </div>
          )}

          {mode === 'signup' && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'var(--bw-text)', lineHeight: 1.5, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0, width: 18, height: 18, accentColor: 'var(--bw-gold)', cursor: 'pointer' }}
              />
              <span>
                I&apos;m 18 or older and I agree to the{' '}
                <a href="https://barwars.app/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bw-gold)', textDecoration: 'underline' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="https://barwars.app/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bw-gold)', textDecoration: 'underline' }}>Privacy Policy</a>.
              </span>
            </label>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading || (mode === 'signup' && !ageConfirmed)} style={{ marginTop: 4 }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {signupSuccess && (
          <div style={{
            fontSize: 13, color: 'var(--bw-gold)', background: 'rgba(245,184,0,0.1)',
            border: '1px solid rgba(245,184,0,0.3)', borderRadius: 8, padding: '12px 14px',
            textAlign: 'center', marginTop: 16,
          }}>
            Check your email to confirm your account, then sign in.
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--bw-muted)' }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
