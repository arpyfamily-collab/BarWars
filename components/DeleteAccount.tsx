'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Trash2, Loader2 } from 'lucide-react'

export default function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data, error: invokeError } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    })

    if (invokeError) {
      setError(invokeError.message)
      setLoading(false)
      return
    }

    if (data?.error) {
      setError(data.error)
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    setSuccess(true)
    setOpen(false)
    router.push('/login')
  }

  if (success) {
    return (
      <div style={{
        fontSize: 13, color: 'var(--bw-green)', background: 'rgba(46,204,113,0.1)',
        border: '1px solid rgba(46,204,113,0.3)', borderRadius: 8, padding: '10px 12px',
        textAlign: 'center',
      }}>
        Your account has been deleted.
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-danger"
        style={{ fontSize: 14, background: 'transparent', border: '1px solid rgba(224,49,49,0.4)', color: 'var(--bw-red)' }}
      >
        <Trash2 size={16} />
        Delete Account
      </button>

      {error && (
        <div style={{
          fontSize: 12, color: 'var(--bw-red)', background: 'rgba(224,49,49,0.1)',
          border: '1px solid rgba(224,49,49,0.3)', borderRadius: 8, padding: '10px 12px',
        }}>
          {error}
        </div>
      )}

      {open && (
        <div
          onClick={() => !loading && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 340, width: '100%', gap: 16, display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', color: 'var(--bw-red)' }}>
              Delete Account
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-text)', lineHeight: 1.6 }}>
              Delete your account? This permanently deletes your profile and predictions. Your messages and battle records stay visible to other players but are no longer linked to you. This can&apos;t be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="btn btn-ghost"
                style={{ fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="btn btn-danger"
                style={{ fontSize: 14 }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
