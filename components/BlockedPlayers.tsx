'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { Ban, Loader2 } from 'lucide-react'

interface BlockedRow {
  blocked_id: string
  created_at: string
  display_name: string | null
}

export default function BlockedPlayers({ userId }: { userId: string }) {
  const [blocks, setBlocks] = useState<BlockedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unblocking, setUnblocking] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    supabase
      .from('user_blocks')
      .select('blocked_id, created_at, blocked:public_profiles!user_blocks_blocked_id_fkey(display_name)')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setBlocks((data ?? []).map((r: any) => ({
          blocked_id:   r.blocked_id,
          created_at:   r.created_at,
          display_name: r.blocked?.display_name ?? null,
        })))
        setLoading(false)
      })
  }, [userId])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  async function handleUnblock(blockedId: string) {
    setUnblocking(blockedId)
    const supabase = createClient()
    await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', blockedId)

    setBlocks(prev => prev.filter(r => r.blocked_id !== blockedId))
    setUnblocking(null)
    setToast('Unblocked.')
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ban size={14} />
        Blocked players
      </div>

      {loading ? (
        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--bw-muted)' }} />
        </div>
      ) : blocks.length === 0 ? (
        <div className="card" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--bw-muted)', fontStyle: 'italic' }}>
          You haven&apos;t blocked anyone.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {blocks.map(row => (
            <div key={row.blocked_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-text)' }}>
                {row.display_name ?? 'Player'}
              </span>
              <button
                onClick={() => handleUnblock(row.blocked_id)}
                disabled={unblocking === row.blocked_id}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                {unblocking === row.blocked_id ? <Loader2 size={14} className="animate-spin" /> : 'Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{
          fontSize: 12, color: 'var(--bw-green)', background: 'rgba(46,204,113,0.1)',
          border: '1px solid rgba(46,204,113,0.3)', borderRadius: 8, padding: '8px 12px',
          marginTop: 8, textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
