'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/BottomNav'
import { Check, Lock, Zap, Clock, Trophy, Sparkles, Eye } from 'lucide-react'

type SkinCategory = 'status' | 'squad' | 'deception' | 'earned' | 'seasonal'
type Rarity = 'common' | 'rare' | 'legendary' | 'exclusive'

interface Skin {
  id: string
  name: string
  slug: string
  description: string | null
  category: SkinCategory
  rarity: Rarity
  icon_url: string | null
  price_cents: number | null
  rental_only: boolean
  rental_hours: number | null
  active: boolean
  sold_count: number
  requires_badge: string | null
}

interface UserSkin {
  id: string
  skin_id: string
  ownership_type: 'purchased' | 'rented' | 'earned' | 'gifted'
  rental_expires_at: string | null
  equipped: boolean
  skins: { id: string; name: string; category: string } | null
}

interface Loadout {
  status_skin_id: string | null
  squad_skin_id: string | null
  deception_skin_id: string | null
}

const LAYER_LABELS: Record<string, string> = {
  status: 'Status Skins',
  squad: 'Squad Skins',
  deception: 'Deception Skins',
  earned: 'Earned / Legacy',
  seasonal: 'Seasonal',
}

const SLUG_EMOJIS: Record<string, string> = {
  'status-idle': '\u{1F6CB}\uFE0F',
  'status-studying': '\u{1F393}',
  'status-class': '\u{1F4DA}',
  'status-gym': '\u{1F4AA}',
  'status-date': '\u2764\uFE0F',
  'status-working': '\u{1F4BC}',
  'status-rallying': '\u{1F4EF}',
  'status-battle': '\u2694\uFE0F',
  'status-locked': '\u{1F512}',
  'status-spectating': '\u{1F440}',
  'deception-false-flag': '\u{1F3AD}',
  'deception-ghost-cloak': '\u{1F47D}',
  'deception-decoy': '\u{1F3AF}',
  'deception-doppelganger': '\u{1F465}',
  'earned-scorched': '\u{1F525}',
  'earned-champion': '\u{1F451}',
  'earned-veteran': '\u{1F6E1}\uFE0F',
  'earned-mata-hari': '\u{1F3AD}',
  'earned-quartermaster': '\u2B50',
  'earned-analyst': '\u{1F441}\uFE0F',
  'earned-founding': '\u{1F396}\uFE0F',
  'seasonal-homecoming': '\u{1F3C8}',
  'seasonal-bowl': '\u{1F3C6}',
}

const LAYER_DESCRIPTIONS: Record<string, string> = {
  status: 'Free — broadcasts what you\u2019re doing right now. Auto-activates based on location.',
  squad: 'Your faction identity. Auto-activates when you enter the war zone.',
  deception: 'Tactical rentals for one night. Espionage layer — fool your rivals on the map.',
  earned: 'Can\u2019t buy these. Have to earn them. The flex that outlasts graduation.',
  seasonal: 'Limited-time drops for game days and campus events.',
}

const RARITY_COLORS: Record<Rarity, string> = {
  common: 'var(--bw-muted)',
  rare: 'var(--bw-cyan)',
  legendary: 'var(--bw-yellow)',
  exclusive: 'var(--bw-violet-soft)',
}

const RARITY_GLOWS: Record<Rarity, string> = {
  common: 'rgba(139,155,180,0.08)',
  rare: 'var(--bw-cyan-glow)',
  legendary: 'var(--bw-yellow-glow)',
  exclusive: 'var(--bw-violet-glow)',
}

function fmtPrice(cents: number | null): string {
  if (!cents || cents === 0) return 'FREE'
  return `$${(cents / 100).toFixed(2)}`
}

function fmtRental(hours: number | null): string {
  if (!hours) return ''
  if (hours >= 24) return ` / ${Math.floor(hours / 24)} day`
  return ` / ${hours}h`
}

function timeUntil(isoStr: string): string {
  const diff = new Date(isoStr).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m left`
}

export default function SkinsPage() {
  const [skins, setSkins] = useState<Skin[]>([])
  const [userSkins, setUserSkins] = useState<Map<string, UserSkin>>(new Map())
  const [loadout, setLoadout] = useState<Loadout | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionSkinId, setActionSkinId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch all active skins
    const { data: skinData } = await supabase
      .from('skins')
      .select('id, name, slug, description, category, rarity, icon_url, price_cents, rental_only, rental_hours, active, sold_count, requires_badge')
      .eq('active', true)
      .order('category')
      .order('price_cents')

    setSkins((skinData as Skin[]) ?? [])

    if (!user) {
      setLoading(false)
      return
    }

    // Fetch user's owned skins
    const { data: owned } = await supabase
      .from('user_skins')
      .select(`
        id, skin_id, ownership_type, rental_expires_at, equipped,
        skins:skin_id(id, name, category)
      `)
      .eq('user_id', user.id)

    const map = new Map<string, UserSkin>()
    for (const item of (owned as unknown as UserSkin[]) ?? []) {
      map.set(item.skin_id, item)
    }
    setUserSkins(map)

    // Fetch loadout
    const { data: loadoutData } = await supabase
      .from('user_skin_loadout')
      .select('status_skin_id, squad_skin_id, deception_skin_id')
      .eq('user_id', user.id)
      .maybeSingle()

    setLoadout(loadoutData as Loadout | null)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAcquire = async (skin: Skin) => {
    setActionSkinId(skin.id)
    setMsg(null)

    try {
      const res = await fetch('/api/skins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin_id: skin.id }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to acquire skin' })
      } else {
        const label = skin.rental_only ? 'rented' : (skin.price_cents && skin.price_cents > 0 ? 'purchased' : 'claimed')
        setMsg({ type: 'success', text: `Skin ${label}! ${skin.name} is now in your inventory.` })
        loadData()
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error — try again' })
    } finally {
      setActionSkinId(null)
    }
  }

  const handleEquip = async (skin: Skin) => {
    setActionSkinId(skin.id)
    setMsg(null)

    try {
      const res = await fetch('/api/skins/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin_id: skin.id, layer: skin.category }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to equip skin' })
      } else {
        setMsg({ type: 'success', text: `${skin.name} equipped!` })
        loadData()
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error' })
    } finally {
      setActionSkinId(null)
    }
  }

  const handleUnequip = async (layer: string) => {
    setMsg(null)

    try {
      const res = await fetch(`/api/skins/equip?layer=${layer}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to unequip' })
      } else {
        setMsg({ type: 'success', text: 'Skin unequipped.' })
        loadData()
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error' })
    }
  }

  const isEquipped = (skin: Skin): boolean => {
    if (!loadout) return false
    if (skin.category === 'status') return loadout.status_skin_id === skin.id
    if (skin.category === 'squad' || skin.category === 'earned' || skin.category === 'seasonal') return loadout.squad_skin_id === skin.id
    if (skin.category === 'deception') return loadout.deception_skin_id === skin.id
    return false
  }

  const isOwned = (skinId: string): UserSkin | null => {
    return userSkins.get(skinId) ?? null
  }

  const isRentalExpired = (ownership: UserSkin): boolean => {
    if (!ownership.rental_expires_at) return false
    return new Date(ownership.rental_expires_at) < new Date()
  }

  // Group skins by category
  const categories: SkinCategory[] = ['status', 'squad', 'deception', 'earned', 'seasonal']
  const groupedSkins = categories.reduce<Record<string, Skin[]>>((acc, cat) => {
    acc[cat] = skins.filter(s => s.category === cat)
    return acc
  }, {})

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bw-muted)', fontSize: 13 }}>
        Loading skins&#8230;
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: '0.04em' }}>
          WAR LOCKER
        </div>
        <div style={{ fontSize: 13, color: 'var(--bw-muted)', marginTop: 4 }}>
          Gear up. Stand out. Deceive everyone.
        </div>
      </div>

      <div className="page-content">

        {msg && (
          <div className="card" style={{
            borderColor: msg.type === 'success' ? 'rgba(46,204,113,0.3)' : 'rgba(224,49,49,0.3)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: msg.type === 'success' ? 'var(--bw-green)' : 'var(--bw-red)' }}>
              {msg.text}
            </div>
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', fontSize: 11, marginTop: 6, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Current loadout summary */}
        {loadout && (
          <div className="card" style={{ borderLeft: '3px solid var(--bw-violet)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bw-muted)', marginBottom: 10 }}>
              Current Loadout
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Status', skinId: loadout.status_skin_id, layer: 'status' },
                { label: 'Squad / Identity', skinId: loadout.squad_skin_id, layer: 'squad' },
                { label: 'Deception', skinId: loadout.deception_skin_id, layer: 'deception' },
              ].map(slot => {
                const skin = slot.skinId ? skins.find(s => s.id === slot.skinId) : null
                return (
                  <div key={slot.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--bw-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{slot.label}</span>
                      <span style={{ color: 'var(--bw-text)', fontWeight: 600 }}>{skin?.name ?? 'None equipped'}</span>
                    </div>
                    {skin && (
                      <button onClick={() => handleUnequip(slot.layer)} style={{ background: 'none', border: 'none', color: 'var(--bw-muted)', fontSize: 11, cursor: 'pointer' }}>
                        Remove
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Skin layers */}
        {categories.map(cat => {
          const layerSkins = groupedSkins[cat]
          if (!layerSkins || layerSkins.length === 0) return null

          const layerIcon = cat === 'status' ? <Eye size={14} />
            : cat === 'squad' ? <Sparkles size={14} />
            : cat === 'deception' ? <Zap size={14} />
            : cat === 'earned' ? <Trophy size={14} />
            : <Sparkles size={14} />

          const layerColor = cat === 'status' ? 'var(--bw-muted)'
            : cat === 'squad' ? 'var(--bw-violet-soft)'
            : cat === 'deception' ? 'var(--bw-cyan)'
            : cat === 'earned' ? 'var(--bw-yellow)'
            : 'var(--bw-gold)'

          return (
            <div key={cat}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: layerColor, marginBottom: 4 }}>
                {layerIcon}
                {LAYER_LABELS[cat]}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bw-muted)', marginBottom: 12, lineHeight: 1.4 }}>
                {LAYER_DESCRIPTIONS[cat]}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {layerSkins.map(skin => {
                  const ownership = isOwned(skin.id)
                  const owned = !!ownership
                  const expired = ownership ? isRentalExpired(ownership) : false
                  const equipped = isEquipped(skin)
                  const rarityColor = RARITY_COLORS[skin.rarity]
                  const rarityGlow = RARITY_GLOWS[skin.rarity]

                  return (
                    <div
                      key={skin.id}
                      className="card"
                      style={{
                        padding: '14px 16px',
                        background: rarityGlow,
                        borderLeft: `3px solid ${rarityColor}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {skin.icon_url && <img src={skin.icon_url} alt="" style={{ width: 20, height: 20 }} />}
                            {SLUG_EMOJIS[skin.slug] && <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{SLUG_EMOJIS[skin.slug]}</span>}
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bw-text)' }}>{skin.name}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                              color: rarityColor, padding: '2px 6px', borderRadius: 12,
                              background: 'rgba(255,255,255,0.06)',
                            }}>
                              {skin.rarity}
                            </span>
                          </div>
                          {skin.description && (
                            <div style={{ fontSize: 12, color: 'var(--bw-muted)', lineHeight: 1.4 }}>{skin.description}</div>
                          )}
                          {skin.sold_count > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--bw-muted)', marginTop: 4 }}>
                              {skin.sold_count} sold
                            </div>
                          )}
                        </div>

                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                          {/* Price / ownership badge */}
                          {!owned && (
                            <span style={{ fontSize: 13, fontWeight: 700, color: rarityColor }}>
                              {fmtPrice(skin.price_cents)}
                              {skin.rental_only && fmtRental(skin.rental_hours)}
                            </span>
                          )}
                          {owned && !expired && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>
                              {ownership?.ownership_type === 'rented' ? 'Rented' : 'Owned'}
                            </span>
                          )}
                          {owned && expired && (
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>Expired</span>
                          )}
                          {owned && !expired && ownership?.rental_expires_at && (
                            <span style={{ fontSize: 10, color: 'var(--bw-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={10} /> {timeUntil(ownership.rental_expires_at)}
                            </span>
                          )}
                          {equipped && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--bw-green)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Check size={12} /> Equipped
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {equipped ? (
                          <button
                            onClick={() => handleUnequip(cat === 'earned' || cat === 'seasonal' ? 'squad' : cat)}
                            disabled={actionSkinId === skin.id}
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '8px 14px' }}
                          >
                            Unequip
                          </button>
                        ) : owned && !expired ? (
                          <button
                            onClick={() => handleEquip(skin)}
                            disabled={actionSkinId === skin.id}
                            style={{
                              background: 'var(--bw-violet)',
                              border: 'none',
                              borderRadius: 8,
                              padding: '8px 16px',
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: '#fff',
                              cursor: actionSkinId === skin.id ? 'not-allowed' : 'pointer',
                              opacity: actionSkinId === skin.id ? 0.5 : 1,
                            }}
                          >
                            Equip
                          </button>
                        ) : expired ? (
                          <button
                            onClick={() => handleAcquire(skin)}
                            disabled={actionSkinId === skin.id}
                            style={{
                              background: skin.rental_only ? 'var(--bw-cyan)' : rarityColor,
                              border: 'none',
                              borderRadius: 8,
                              padding: '8px 16px',
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: '#0A0A0C',
                              cursor: actionSkinId === skin.id ? 'not-allowed' : 'pointer',
                              opacity: actionSkinId === skin.id ? 0.5 : 1,
                            }}
                          >
                            {actionSkinId === skin.id ? '...' : `Re-rent ${fmtPrice(skin.price_cents)}`}
                          </button>
                        ) : skin.requires_badge ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bw-muted)' }}>
                            <Lock size={14} /> Requires badge: {skin.requires_badge}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAcquire(skin)}
                            disabled={actionSkinId === skin.id}
                            style={{
                              background: skin.rental_only ? 'var(--bw-cyan)' : (skin.price_cents && skin.price_cents > 0 ? rarityColor : 'var(--bw-green)'),
                              border: 'none',
                              borderRadius: 8,
                              padding: '8px 16px',
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: skin.price_cents && skin.price_cents > 0 ? '#0A0A0C' : '#fff',
                              cursor: actionSkinId === skin.id ? 'not-allowed' : 'pointer',
                              opacity: actionSkinId === skin.id ? 0.5 : 1,
                            }}
                          >
                            {actionSkinId === skin.id ? '...' : (
                              skin.price_cents && skin.price_cents > 0
                                ? `${skin.rental_only ? 'Rent' : 'Buy'} ${fmtPrice(skin.price_cents)}`
                                : 'Claim Free'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

      </div>
      <BottomNav />
    </div>
  )
}
