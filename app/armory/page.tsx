'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/BottomNav'
import { Shield, Gift, TrendingUp, Clock } from 'lucide-react'

interface ArmoryItem {
  id: string
  offer_type: string
  offer_value: string
  status: string
  created_at: string
  current_venue_id: string | null
  venues: { name: string } | null
}

interface ArmoryStats {
  totalDonated: number
  availableNow: number
  claimedThisWeek: number
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function ArmoryPage() {
  const [items, setItems] = useState<ArmoryItem[]>([])
  const [stats, setStats] = useState<ArmoryStats>({ totalDonated: 0, availableNow: 0, claimedThisWeek: 0 })
  const [claimedThisWeek, setClaimedThisWeek] = useState(false)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadArmory = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: available } = await supabase
      .from('armory')
      .select(`
        id, offer_type, offer_value, status, created_at, current_venue_id,
        venues:current_venue_id(name)
      `)
      .eq('status', 'available')
      .order('created_at', { ascending: false })

    setItems((available as unknown as ArmoryItem[]) ?? [])

    const { count: total } = await supabase
      .from('armory')
      .select('*', { count: 'exact', head: true })

    const { count: availableCount } = await supabase
      .from('armory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: claimedWeek } = await supabase
      .from('armory')
      .select('*', { count: 'exact', head: true })
      .not('claimed_at', 'is', null)
      .gte('claimed_at', sevenDaysAgo)

    setStats({
      totalDonated: total ?? 0,
      availableNow: availableCount ?? 0,
      claimedThisWeek: claimedWeek ?? 0,
    })

    if (user) {
      const { data: myClaims } = await supabase
        .from('armory')
        .select('id')
        .eq('claimed_by', user.id)
        .gte('claimed_at', sevenDaysAgo)
        .limit(1)

      setClaimedThisWeek((myClaims ?? []).length > 0)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadArmory()

    const supabase = createClient()
    const channel = supabase.channel('armory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'armory' }, () => {
        loadArmory()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadArmory])

  const handleClaim = async (armoryId: string) => {
    setClaimingId(armoryId)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/armory/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ armory_id: armoryId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to claim')
      } else {
        setSuccess('Bracelet claimed! Show it at the bar to redeem your reward.')
        setClaimedThisWeek(true)
        loadArmory()
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setClaimingId(null)
    }
  }

  const statCards = [
    { label: 'Donated', value: stats.totalDonated, icon: <Gift size={14} />, color: 'var(--bw-yellow)' },
    { label: 'Available', value: stats.availableNow, icon: <TrendingUp size={14} />, color: 'var(--bw-green)' },
    { label: 'Claimed (7d)', value: stats.claimedThisWeek, icon: <Clock size={14} />, color: 'var(--bw-violet-soft)' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          THE ARMORY
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Donated bracelets up for grabs. One claim per week.
        </div>
      </div>

      <div className="page-content">

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="card"
              style={{ flex: 1, padding: '12px 10px', textAlign: 'center', minWidth: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4, color: stat.color }}>
                {stat.icon}
              </div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.04em', color: 'var(--bw-text)', lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Success message */}
        {success && (
          <div className="card" style={{ borderColor: 'rgba(46,204,113,0.4)', background: 'rgba(46,204,113,0.06)', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>&#127881;</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bw-green)' }}>{success}</div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="card" style={{ borderColor: 'rgba(224,49,49,0.3)', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--bw-red)' }}>{error}</div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ fontSize: 13, color: 'var(--bw-muted)', textAlign: 'center', padding: '32px 0' }}>
            Loading the armory&#8230;
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#128230;</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--bw-text)' }}>
              The Armory is empty
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginBottom: 16 }}>
              Find a bracelet and donate it to stock the shelves.
            </div>
            <Link href="/drops" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none', fontSize: 13, padding: '10px 20px' }}>
              Find bracelets
            </Link>
          </div>
        )}

        {/* Available bracelets */}
        {!loading && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{ padding: '14px 16px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Bar name */}
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bw-text)', marginBottom: 4 }}>
                      {item.venues?.name ?? 'Unknown bar'}
                    </div>

                    {/* Offer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{
                        display: 'inline-block',
                        background: 'var(--bw-yellow-glow)',
                        color: 'var(--bw-yellow)',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        letterSpacing: '0.04em',
                      }}>
                        {item.offer_value}
                      </div>
                    </div>

                    {/* Donated by + time */}
                    <div style={{ fontSize: 11, color: 'var(--bw-muted)' }}>
                      Donated by a fellow soldier &middot; {timeAgo(item.created_at)}
                    </div>
                  </div>

                  {/* Claim button */}
                  <div style={{ flexShrink: 0 }}>
                    {claimedThisWeek ? (
                      <button
                        disabled
                        style={{
                          background: 'var(--bw-surface)',
                          border: '1px solid var(--bw-border)',
                          borderRadius: 8,
                          padding: '8px 14px',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'var(--bw-muted)',
                          cursor: 'not-allowed',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Claimed this week
                      </button>
                    ) : (
                      <button
                        onClick={() => handleClaim(item.id)}
                        disabled={claimingId === item.id}
                        style={{
                          background: 'var(--bw-violet)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 16px',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: '#fff',
                          cursor: claimingId === item.id ? 'not-allowed' : 'pointer',
                          opacity: claimingId === item.id ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {claimingId === item.id ? 'Claiming&#8230;' : 'Claim'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
