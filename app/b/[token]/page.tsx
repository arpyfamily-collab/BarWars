'use client'

/** A phone camera pointed at a BarWars band lands here. Finding happens in the app's Bracelet Hunt. */
import Link from 'next/link'

export default function BandPage() {
  return (
    <div className="page"><div className="page-content" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 48 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30 }}>🎁 You found a BarWars bracelet</div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', margin: '8px 0 16px' }}>Open the Bracelet Hunt and tap Scan to claim it.</div>
        <Link href="/bracelet-hunt" className="btn btn-primary" style={{ display: 'block' }}>Open the Bracelet Hunt</Link>
      </div>
    </div></div>
  )
}
