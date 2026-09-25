'use client'
import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
export default function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()
  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button
      onClick={handleSignOut}
      style={{
        background: 'transparent',
        border: '1px solid rgba(201,168,76,0.3)',
        color: '#C9A84C',
        padding: '4px 12px',
        borderRadius: 4,
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      Sign Out
    </button>
  )
}
