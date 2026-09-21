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

// ─── Greek Turf Wars ──────────────────────────────────────────────────────────

export type OrgType = 'fraternity' | 'sorority'
export type ClaimType = 'initial_claim' | 'sneak_attack' | 'war_declaration'
export type ClaimStatus = 'pending' | 'operator_pending' | 'live' | 'successful' | 'failed' | 'contested' | 'cancelled'
export type TurfEventType = 'claim_announced' | 'sneak_attack_detected' | 'war_declared' | 'rally_called' | 'turf_lost' | 'turf_defended' | 'maintenance_missed' | 'maintenance_warning'
export type MaintenanceStatus = 'pending' | 'met' | 'missed' | 'warning'
export type OrgMemberRole = 'member' | 'admin'
export type CheckinMethod = 'qr_scan' | 'geo_pulse'

export interface GreekOrg {
  id: string
  org_type: OrgType
  name: string
  chapter: string
  verified_member_count: number
  home_turf_bar_id?: string
  turf_claimed_at?: string
  turf_streak_weeks: number
  turf_wins: number
  turf_losses: number
  created_at: string
}

export interface OrgMembership {
  id: string
  org_id: string
  user_id: string
  role: OrgMemberRole
  verified: boolean
  verified_by?: string
  verified_at?: string
  created_at: string
}

export interface TurfClaim {
  id: string
  claim_type: ClaimType
  attacking_org_id: string
  defending_org_id?: string
  bar_id: string
  status: ClaimStatus
  announced_at: string
  window_open_at: string
  window_close_at: string
  required_headcount: number
  attacker_verified_headcount: number
  defender_verified_headcount: number
  detection_threshold: number
  detected_at?: string
  rally_window_minutes: number
  lockout_days: number
  approved_by?: string
  approved_at?: string
  cancel_reason?: string
  result?: string
  created_at: string
}

export interface TurfCheckin {
  id: string
  claim_id: string
  user_id: string
  org_id: string
  bar_id: string
  verified_at: string
  method: CheckinMethod
}

export interface TurfMaintenanceNight {
  id: string
  org_id: string
  bar_id: string
  day_of_week: number
  window_start_time: string
  window_end_time: string
  required_headcount_pct: number
  status: MaintenanceStatus
  last_checked_at?: string
  consecutive_misses: number
  created_at: string
}

export interface TurfSpecial {
  id: string
  bar_id: string
  org_id: string
  description: string
  discount_cents: number
  active: boolean
  valid_day_of_week?: number
  created_at: string
}

export interface TurfEvent {
  id: string
  claim_id?: string
  event_type: TurfEventType
  org_id?: string
  bar_id: string
  headline: string
  body?: string
  deep_link?: string
  visible_to: 'public' | 'orgs_only'
  created_at: string
}

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  initial_claim:    'Initial Claim',
  sneak_attack:     'Sneak Attack',
  war_declaration:  'War Declaration',
}

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  pending:          'Pending',
  operator_pending: 'Needs Approval',
  live:             'Live',
  successful:       'Successful',
  failed:           'Failed',
  contested:        'Contested',
  cancelled:        'Cancelled',
}

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  fraternity: 'Fraternity',
  sorority:   'Sorority',
}

export const DAY_OF_WEEK_LABELS: string[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
