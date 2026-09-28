'use client'

/**
 * Staff tool (To-Do item 10): move a player between factions, bypassing cooldowns and locks.
 * Every move needs a note and is recorded in faction_history with who made it.
 */
import { useEffect, useState } from 'react'

type Target = 'greek' | 'company' | 'regiment' | 'none'

export default function FactionMoveTool() {
  const [email, setEmail] = useState('')
  const [toType, setToType] = useState<Target>('greek')
  const [toId, setToId] = useState('')
  const [note, setNote] = useState('')
  const [lists, setLists] = useState<Record<string, { id: string; name: string }[]>>({ greek: [], company: [], regiment: [] })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const get = (url: string) => fetch(url).then(r => r.json()).then(d => (Array.isArray(d) ? d : []).map((x: any) => ({ id: x.id, name: x.chapter && x.chapter !== 'Main' ? `${x.name} (${x.chapter})` : x.name }))).catch(() => [])
    Promise.all([get('/api/greek-orgs'), get('/api/turf-wars/hessians'), get('/api/turf-wars/regiments')])
      .then(([greek, company, regiment]) => setLists({ greek, company, regiment }))
  }, [])

  async function move() {
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/operator/faction-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, to_type: toType, to_id: toType === 'none' ? null : toId, note }),
      })
      const data = await res.json()
      setResult(res.ok ? { ok: true, text: `Moved ${email}.` } : { ok: false, text: data.error || 'Move failed' })
      if (res.ok) { setNote(''); setEmail('') }
    } catch { setResult({ ok: false, text: 'Network error' }) }
    finally { setBusy(false) }
  }

  const input: React.CSSProperties = { width: '100%', background: '#0D1117', border: '1px solid var(--bw-border)', borderRadius: 8, padding: '8px 10px', color: 'var(--bw-text)', fontSize: 13 }
  return (
    <div style={{ marginTop: 40, background: 'var(--bw-surface)', border: '1px solid var(--bw-border)', borderRadius: 12, padding: 20, maxWidth: 560 }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', marginBottom: 4 }}>Move a player between factions</div>
      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        For players who signed up for the wrong group. Skips cooldowns and locks. A captain moved out hands their unit to its longest-serving member.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <input style={input} placeholder="Player's email" value={email} onChange={e => setEmail(e.target.value)} />
        <select style={input} value={toType} onChange={e => { setToType(e.target.value as Target); setToId('') }}>
          <option value="greek">Into a Greek org</option>
          <option value="company">Into a Hessian company</option>
          <option value="regiment">Into a Regiment</option>
          <option value="none">Out of their Greek org, company and Regiment</option>
        </select>
        {toType !== 'none' && (
          <select style={input} value={toId} onChange={e => setToId(e.target.value)}>
            <option value="">Choose…</option>
            {(lists[toType] ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <textarea style={{ ...input, minHeight: 60 }} placeholder="Why (required; saved with the move)" value={note} onChange={e => setNote(e.target.value)} />
        <button onClick={move} disabled={busy || !email || !note.trim() || (toType !== 'none' && !toId)}
          style={{ background: 'var(--bw-violet)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Moving…' : 'Move player'}
        </button>
        {result && <div style={{ fontSize: 13, color: result.ok ? 'var(--bw-green)' : 'var(--bw-red)' }}>{result.text}</div>}
      </div>
    </div>
  )
}
