'use client'

/** War page, after the war is decided (item 18 Phase 2): the whole war in one recap. In-app only for now. */
import { useEffect, useState } from 'react'

const ICON: Record<string, string> = { jam: '📵', static: '▒', blackout: '⚡', order: '📜', forgery: '🕵️', decrypt: '🔐', wiretap: '🎧' }

export default function AfterActionReport({ claimId }: { claimId: string }) {
  const [r, setR] = useState<any>(null)
  useEffect(() => { fetch(`/api/turf-wars/${claimId}/after-action`).then(x => x.ok ? x.json() : null).then(setR).catch(() => {}) }, [claimId])
  if (!r) return null
  const loud = Number(r.crowd?.attacker_roars ?? 0) >= Number(r.crowd?.defender_roars ?? 0) ? r.attacker : r.defender
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--bw-gold)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-gold)', marginBottom: 8 }}>📋 After-Action Report</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{r.underdog ? '🏆 Underdog win. ' : ''}{r.result}</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', margin: '4px 0 10px' }}>
        {r.attacker} {Number(r.attacker_headcount ?? 0)} at the bar{r.attacker_score != null ? ` (score ${Number(r.attacker_score)})` : ''} · {r.defender ?? 'The bar'} {Number(r.defender_headcount ?? 0)}{r.defender_score != null ? ` (score ${Number(r.defender_score)})` : ''}
      </div>
      {r.timeline?.length ? r.timeline.map((e: any, i: number) => (
        <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--bw-border)', display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--bw-muted)', minWidth: 52 }}>{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span>{ICON[e.kind] ?? '•'} {e.what}</span>
        </div>
      )) : <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>A clean fight: no jams, static, forgeries or wiretaps.</div>}
      {(Number(r.crowd?.attacker_roars) + Number(r.crowd?.defender_roars) > 0 || r.crowd?.shouts > 0) && (
        <div style={{ fontSize: 12, marginTop: 10 }}>
          📣 Crowd: {r.crowd.attacker_roars} roars for {r.attacker}, {r.crowd.defender_roars} for {r.defender}{r.crowd.shouts ? ` · ${r.crowd.shouts} Shouts` : ''}. Loudest: {loud}.
        </div>
      )}
    </div>
  )
}
