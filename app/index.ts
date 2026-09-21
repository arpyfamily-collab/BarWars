export type PassType = 'full_venue' | 'music_hall' | 'bull_patio' | 'sports_lounge'
export type PassStatus = 'active' | 'redeemed' | 'expired' | 'cancelled' | 'pending_renewal'
export type NightTier = 'slow' | 'standard' | 'marquee'

export interface Venue {
  id: string
  name: string
  slug: string
  address: string
  city: string
  state: string
  total_capacity: number
  music_hall_capacity: number
  bull_patio_capacity: number
  sports_lounge_capacity: number
  logo_url?: string
  stripe_account_id?: string
}

export interface Event {
  id: string
  venue_id: string
  name: string
  date: string
  night_tier: NightTier
  full_venue_price: number
  music_hall_price: number
  bull_patio_price: number
  sports_lounge_price: number
  full_venue_capacity: number
  music_hall_capacity: number
  bull_patio_capacity: number
  sports_lounge_capacity: number
  full_venue_sold: number
  music_hall_sold: number
  bull_patio_sold: number
  sports_lounge_sold: number
  fire_sale_active: boolean
  fire_sale_discount_cents: number
  fire_sale_expires_at?: string
  fire_sale_limit: number
  fire_sale_claimed: number
  notes?: string
  created_at: string
}

export interface TimeWindow {
  id: string
  event_id: string
  label: string
  start_time: string
  end_time: string
  grace_minutes: number
  total_slots: number
  booked_slots: number
  pass_types: PassType[]
  price_modifier: number
}

export interface Pass {
  id: string
  event_id: string
  user_id: string
  pass_type: PassType
  status: PassStatus
  qr_token: string
  time_window_id?: string
  arrival_deadline?: string
  stripe_payment_intent_id?: string
  amount_paid: number
  redeemed_at?: string
  redeemed_by?: string
  renewal_count: number
  renewal_fee_cents: number
  created_at: string
}

export interface LibraryCardSubscription {
  id: string
  user_id: string
  venue_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  status: 'active' | 'paused' | 'cancelled'
  current_period_start: string
  current_period_end: string
  billing_paused: boolean
  passes_remaining_this_month: number
  passes_per_month: number
  created_at: string
}

export interface ScanResult {
  success: boolean
  message: string
  pass?: Pass
  patron_name?: string
  pass_type_label?: string
  time_window_label?: string
}

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  full_venue:    'Full Venue',
  music_hall:    'Music Hall',
  bull_patio:    'Bull + Patio',
  sports_lounge: 'Sports Lounge',
}

export const ROOM_PASS_MULTIPLIERS: Record<PassType, number> = {
  full_venue:    1.0,
  music_hall:    0.57,
  bull_patio:    0.57,
  sports_lounge: 0.57,
}

export const NIGHT_TIER_LABELS: Record<NightTier, string> = {
  slow:     'Weeknight',
  standard: 'Weekend',
  marquee:  'Game Day',
}
