'use client'

interface Props {
  secondsRemaining: number
  urgent?: boolean   // true when < 5 min — turns red
}

export default function BattleCountdown({ secondsRemaining, urgent }: Props) {
  const h    = Math.floor(secondsRemaining / 3600)
  const m    = Math.floor((secondsRemaining % 3600) / 60)
  const s    = secondsRemaining % 60

  const fmt  = (n: number) => String(n).padStart(2, '0')
  const isUrgent = urgent ?? secondsRemaining <= 300  // < 5 min

  if (secondsRemaining <= 0) {
    return (
      <div style={{
        fontFamily:    'Bebas Neue, sans-serif',
        fontSize:      28,
        letterSpacing: '0.06em',
        color:         'var(--bw-muted)',
      }}>
        WAR OVER
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
      {h > 0 && (
        <>
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: isUrgent ? '#E24B4A' : 'var(--bw-text)', letterSpacing: '0.04em', transition: 'color 0.5s' }}>{fmt(h)}</span>
          <span style={{ fontSize: 14, color: 'var(--bw-muted)', margin: '0 2px' }}>h</span>
        </>
      )}
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: isUrgent ? '#E24B4A' : 'var(--bw-text)', letterSpacing: '0.04em', transition: 'color 0.5s' }}>{fmt(m)}</span>
      <span style={{ fontSize: 14, color: 'var(--bw-muted)', margin: '0 2px' }}>m</span>
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: isUrgent ? '#E24B4A' : 'var(--bw-text)', letterSpacing: '0.04em', transition: 'color 0.5s' }}>{fmt(s)}</span>
      <span style={{ fontSize: 14, color: 'var(--bw-muted)', margin: '0 2px' }}>s</span>
    </div>
  )
}
