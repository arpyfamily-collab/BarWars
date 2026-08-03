'use client'

interface Props {
  headline:     string
  deepLink:     string
  referralCode: string
  barName:      string
  barColor:     string
}

export default function ShareCard({ headline, deepLink, referralCode, barName, barColor }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'BarWars', text: headline, url: deepLink })
    } else {
      copy()
    }
  }

  return (
    <div style={{
      background:   `${barColor}14`,
      border:       `1px solid ${barColor}44`,
      borderRadius: 'var(--bw-radius-lg)',
      padding:      '16px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: barColor, marginBottom: 8 }}>
        You're in — bring reinforcements
      </div>
      <div style={{ fontSize: 14, color: 'var(--bw-text)', fontWeight: 600, marginBottom: 4 }}>
        {headline}
      </div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 14 }}>
        Friends who join using your link earn you +5 pts if they show up.
      </div>
      <button
        onClick={share}
        style={{
          width:        '100%',
          padding:      '11px',
          background:   barColor,
          border:       'none',
          borderRadius: 'var(--bw-radius)',
          color:        '#fff',
          fontWeight:   600,
          fontSize:     14,
          cursor:       'pointer',
        }}
      >
        {copied ? 'Link copied!' : `Share · Fight for ${barName}`}
      </button>
    </div>
  )
}

// Need useState — add import at top
import { useState } from 'react'
