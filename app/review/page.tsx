'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Copy, Check, ScanLine } from 'lucide-react'
import QRCode from 'qrcode'

interface TestBracelet {
  id: string
  qr_token: string
  status: string
  offer_value: string | null
  hidden_at: string
  found_at: string | null
  venues: { name: string } | null
}

export default function ReviewPage() {
  const [bracelet, setBracelet] = useState<TestBracelet | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [, setTick] = useState(0)

  const loadBracelet = useCallback(async () => {
    try {
      const res = await fetch('/api/review/bracelet')
      const data = await res.json()
      if (data.bracelet) {
        setBracelet(data.bracelet)
        const payload = JSON.stringify({ t: data.bracelet.qr_token, v: 1 })
        const url = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 3,
          color: { dark: '#0A0A0C', light: '#FFFFFF' },
          errorCorrectionLevel: 'H',
        })
        setQrDataUrl(url)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBracelet()
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [loadBracelet])

  const handleCopy = async () => {
    if (!bracelet) return
    await navigator.clipboard.writeText(bracelet.qr_token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await fetch('/api/review/bracelet', { method: 'POST' })
      await loadBracelet()
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  const fmtCountdown = (dateStr: string) => {
    const resetAt = new Date(dateStr).getTime() + 6 * 60 * 60 * 1000
    const diff = resetAt - Date.now()
    if (diff <= 0) return 'Resetting soon…'
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return `${h}h ${m}m ${s}s`
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading test bracelets…
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: 'var(--bw-muted)', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          APP REVIEW
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card" style={{ borderColor: 'rgba(224,255,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <ScanLine size={20} style={{ color: 'var(--bw-yellow)' }} />
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', color: 'var(--bw-yellow)' }}>
              TEST BRACELET
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            This page generates a scannable QR code for the App Review test bracelet.
            Open <Link href="/bracelet-hunt" style={{ color: 'var(--bw-yellow)', textDecoration: 'underline' }}>Bracelet Hunt</Link>,
            tap <strong style={{ color: 'var(--bw-text)' }}>Scan QR</strong> on the test bracelet card,
            then photograph or screenshot the code below. You can also copy the code text and paste it manually.
          </div>

          {bracelet ? (
            <>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)' }}>
                  {bracelet.venues?.name ?? 'Test Venue'}
                </div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: bracelet.status === 'hidden' ? 'var(--bw-yellow-glow)' : 'rgba(224,49,49,0.15)',
                  color: bracelet.status === 'hidden' ? 'var(--bw-yellow)' : 'var(--bw-red)',
                }}>
                  {bracelet.status}
                </div>
              </div>

              {qrDataUrl && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div className="qr-container" style={{ padding: 20 }}>
                    <img src={qrDataUrl} alt="Test bracelet QR code" style={{ width: 260, height: 260 }} />
                  </div>
                </div>
              )}

              <div className="card" style={{ background: 'var(--bw-surface)', padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 6 }}>
                  Bracelet Code
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 12, color: 'var(--bw-text)', wordBreak: 'break-all' }}>
                    {bracelet.qr_token}
                  </code>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: 'var(--bw-card)',
                      border: '1px solid var(--bw-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: copied ? 'var(--bw-green)' : 'var(--bw-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--bw-muted)', marginBottom: 16 }}>
                <div>
                  {bracelet.status === 'hidden'
                    ? `Resets in ${fmtCountdown(bracelet.hidden_at)}`
                    : `Found — resets in ${fmtCountdown(bracelet.hidden_at)}`}
                </div>
              </div>

              <button
                onClick={handleReset}
                disabled={resetting}
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                <RefreshCw size={16} className={resetting ? 'spin' : ''} />
                {resetting ? 'Resetting…' : 'Reset bracelet now'}
              </button>

              <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.8s linear infinite; }`}</style>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--bw-muted)', fontSize: 13 }}>
              No test bracelet found. Try resetting.
              <div style={{ marginTop: 12 }}>
                <button onClick={handleReset} disabled={resetting} className="btn btn-ghost" style={{ fontSize: 13 }}>
                  <RefreshCw size={16} />
                  {resetting ? 'Resetting…' : 'Create test bracelet'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
            How to test
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--bw-yellow)', fontWeight: 700, flexShrink: 0 }}>1</span>
              <span>Open <Link href="/bracelet-hunt" style={{ color: 'var(--bw-yellow)', textDecoration: 'underline' }}>Bracelet Hunt</Link> on your phone</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--bw-yellow)', fontWeight: 700, flexShrink: 0 }}>2</span>
              <span>Find the <strong>App Review test bracelet</strong> card</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--bw-yellow)', fontWeight: 700, flexShrink: 0 }}>3</span>
              <span>Tap <strong>Scan QR</strong> and photograph the code above, or tap to paste the code text</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--bw-yellow)', fontWeight: 700, flexShrink: 0 }}>4</span>
              <span>Choose <strong>Keep it</strong> or <strong>Donate to Armory</strong> to complete the flow</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--bw-muted)', fontWeight: 700, flexShrink: 0 }}>5</span>
              <span style={{ color: 'var(--bw-muted)' }}>The bracelet auto-resets every 6 hours, or tap reset above</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
