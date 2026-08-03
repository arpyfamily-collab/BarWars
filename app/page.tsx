'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import CapacityMeter from '@/components/CapacityMeter'
import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { NIGHT_TIER_LABELS } from '@/types'

export default function HomePage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('events')
      .select('*, venues(*)')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(10)
      .then(({ data }) => {
        setEvents(data ?? [])
        setLoading(false)
      })
  }, [])

  const activeSale = events.find(e => e.fire_sale_active && e.fire_sale_expires_at)

  return (
    <div className="page">
      <div style={{ padding: '48px 20px 8px' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 42, letterSpacing: '0.04em', lineHeight: 1, color: 'var(--bw-gold)' }}>BarWars</div>
        <div style={{ fontSize: 14, color: 'var(--bw-muted)', marginTop: 4 }}>Skip the line. Own the night.</div>
      </div>

      <div className="page-content" style={{ paddingTop: 20 }}>
        {activeSale && (
          <div className="fire-sale-banner">
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--bw-red)' }}>🔥 FIRE SALE</div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Limited passes dropping now</div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12 }}>
            Upcoming nights
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--bw-muted)', fontSize: 13 }}>
              Loading tonight…
            </div>
          ) : (
            <div className="stack stack-md">
              {events.map(event => {
                const venue = event.venues
                return (
                  <Link key={event.id} href={`/venue/${venue?.slug}?event=${event.id}`}>
                    <div className="card" style={{ cursor: 'pointer' }}>
                      <div className="row-between" style={{ marginBottom: 4 }}>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>{venue?.name}</div>
                        <span className={`badge ${event.night_tier === 'marquee' ? 'badge-red' : event.night_tier === 'standard' ? 'badge-gold' : 'badge-gray'}`}>
                          {NIGHT_TIER_LABELS[event.night_tier as keyof typeof NIGHT_TIER_LABELS]}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--bw-muted)', marginBottom: 14 }}>
                        {event.name} · {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="row-between" style={{ marginBottom: 12 }}>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--bw-gold)', letterSpacing: '0.04em', lineHeight: 1 }}>
                          ${(event.full_venue_price / 100).toFixed(0)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--bw-muted)' }}>from full venue</div>
                      </div>
                      <CapacityMeter sold={event.full_venue_sold} capacity={event.full_venue_capacity} label="Venue" />
                    </div>
                  </Link>
                )
              })}
              {events.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--bw-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                  <div style={{ fontWeight: 600 }}>No events tonight</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Check back soon.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
