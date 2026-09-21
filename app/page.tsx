import { createClient } from '@/lib/supabase-client'
import CapacityMeter from '@/components/CapacityMeter'
import BottomNav from '@/components/BottomNav'
import TurfMap from '@/components/TurfMap'
import BattleFeed from '@/components/BattleFeed'
import ContextFAB from '@/components/ContextFAB'
import Link from 'next/link'
import { Flame, Shield } from 'lucide-react'
import { NIGHT_TIER_LABELS } from '@/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: events } = await supabase
    .from('events')
    .select('*, venues(*)')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(10)

  const activeSale = events?.find(e => e.fire_sale_active && e.fire_sale_expires_at)

  const { count: activeAttacks } = await supabase
    .from('turf_claims')
    .select('*', { count: 'exact', head: true })
    .in('status', ['live'])
    .in('claim_type', ['sneak_attack', 'war_declaration'])

  return (
    <div className="page">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ padding: '48px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 42,
            letterSpacing: '0.04em', lineHeight: 1, color: 'var(--bw-gold)',
          }}>
            BarWars
          </div>
          {(activeAttacks ?? 0) > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(224,49,49,0.12)', border: '1px solid rgba(224,49,49,0.35)',
              borderRadius: 20, padding: '4px 10px',
              fontSize: 11, fontWeight: 700, color: '#E03131',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#E03131',
                display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite',
              }} />
              {activeAttacks} LIVE BATTLE{(activeAttacks ?? 0) > 1 ? 'S' : ''}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>
          Skip the line. Own the night.
        </div>
      </div>

      <div className="page-content" style={{ paddingTop: 16 }}>

        {/* ── Fire Sale Banner ────────────────────────────────── */}
        {activeSale && (
          <div className="fire-sale-banner" style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--bw-red)' }}>
              FIRE SALE
            </div>
            <div style={{ fontSize: 13, color: 'var(--bw-muted)' }}>Limited passes dropping now</div>
          </div>
        )}

        {/* ── War Map ─────────────────────────────────────────── */}
        <TurfMap />

        {/* ── War Chest Carousel ──────────────────────────────── */}
        {events && events.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Shield size={11} />
              War Chest
            </div>

            <div style={{
              display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4,
              scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
              msOverflowStyle: 'none', scrollbarWidth: 'none',
            }}>
              {events.map(event => {
                const venue = (event as any).venues
                const isFireSale = event.fire_sale_active && event.fire_sale_expires_at
                return (
                  <Link
                    key={event.id}
                    href={`/venue/${venue?.slug}?event=${event.id}`}
                    style={{ textDecoration: 'none', scrollSnapAlign: 'start', flexShrink: 0 }}
                  >
                    <div style={{
                      width: 220,
                      background: isFireSale ? 'rgba(224,49,49,0.08)' : '#161B27',
                      border: `1px solid ${isFireSale ? 'rgba(224,49,49,0.4)' : '#252D3D'}`,
                      borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
                    }}>
                      {isFireSale && (
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: '#E03131',
                          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6,
                        }}>
                          <Flame size={11} /> FIRE SALE
                        </div>
                      )}
                      <div style={{
                        fontFamily: 'Bebas Neue, sans-serif', fontSize: 20,
                        letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: 4,
                      }}>
                        {venue?.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 10 }}>
                        {event.name} · {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{
                          fontFamily: 'Bebas Neue, sans-serif', fontSize: 28,
                          color: isFireSale ? '#E03131' : 'var(--bw-gold)',
                          letterSpacing: '0.04em', lineHeight: 1,
                        }}>
                          ${(event.full_venue_price / 100).toFixed(0)}
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                          padding: '3px 8px', borderRadius: 20,
                          background: event.night_tier === 'marquee' ? 'rgba(224,49,49,0.15)'
                            : event.night_tier === 'standard' ? 'rgba(201,168,76,0.15)'
                            : 'rgba(139,155,180,0.15)',
                          color: event.night_tier === 'marquee' ? '#E03131'
                            : event.night_tier === 'standard' ? 'var(--bw-gold)'
                            : 'var(--bw-muted)',
                        }}>
                          {NIGHT_TIER_LABELS[event.night_tier as keyof typeof NIGHT_TIER_LABELS]}
                        </span>
                      </div>
                      <CapacityMeter
                        sold={event.full_venue_sold}
                        capacity={event.full_venue_capacity}
                        label="Venue"
                      />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Battle Feed + Leaderboard ───────────────────────── */}
        <div style={{ marginTop: 20 }}>
          <BattleFeed />
        </div>

        {(!events || events.length === 0) && (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--bw-muted)', marginTop: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
            <div style={{ fontWeight: 600 }}>No events tonight</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Check back soon.</div>
          </div>
        )}

      </div>

      <ContextFAB />
      <BottomNav />
    </div>
  )
}
