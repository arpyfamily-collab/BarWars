import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
})

export const LIBRARY_CARD_PRICE_CENTS = 4999

export const SUMMER_MONTHS = [5, 6, 7]

export function isSummerMonth(date = new Date()): boolean {
  return SUMMER_MONTHS.includes(date.getMonth())
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
