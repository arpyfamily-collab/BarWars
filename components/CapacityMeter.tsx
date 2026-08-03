'use client'
interface Props { sold: number; capacity: number; label?: string; showCount?: boolean }
export default function CapacityMeter({ sold, capacity, label, showCount = true }: Props) {
  const pct = Math.min(100, Math.round((sold / capacity) * 100))
  const level = pct >= 85 ? 'high' : pct >= 55 ? 'medium' : 'low'
  const remaining = capacity - sold
  return (
    <div className="stack stack-sm">
      {(label || showCount) && (
        <div className="row-between">
          {label && <span style={{ fontSize: 12, color: 'var(--bw-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>}
          {showCount && <span style={{ fontSize: 12, color: level === 'high' ? 'var(--bw-red)' : level === 'medium' ? 'var(--bw-gold)' : 'var(--bw-green)', fontWeight: 600 }}>{remaining <= 0 ? 'SOLD OUT' : `${remaining} left`}</span>}
        </div>
      )}
      <div className="capacity-track">
        <div className={`capacity-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
