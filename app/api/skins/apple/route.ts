import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'
import { verifyAppleJWS, APPLE_BUNDLE_ID } from '@/lib/apple-jws'

export const dynamic = 'force-dynamic'

/**
 * Paid skins through Apple in-app purchase (ready for Build 4's purchase button).
 * GET  → paid skins and their App Store product IDs (the app loads these products from StoreKit)
 * POST { signed_transaction } → StoreKit 2's JWS for a completed purchase. The app must set
 *      appAccountToken to the player's account ID when buying, so a receipt can't be claimed by someone else.
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const { data } = await createServiceClient().from('skins').select('id, name, price_cents, apple_product_id').not('apple_product_id', 'is', null).eq('active', true)
  return ok({ products: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth()
  if (error) return error
  let body: any
  try { body = await req.json() } catch { return err('Invalid JSON') }
  let t: any
  try { t = verifyAppleJWS(body.signed_transaction) } catch { return err("Couldn't verify that purchase with Apple.", 400) }
  if (t.bundleId !== APPLE_BUNDLE_ID) return err('That purchase is for a different app.', 400)
  if (!['Production', 'Sandbox'].includes(t.environment)) return err('Unknown App Store environment.', 400)
  if ((t.appAccountToken ?? '').toLowerCase() !== userId!.toLowerCase()) return err('That purchase belongs to a different account.', 403)
  if (t.revocationDate) return err('That purchase was refunded.', 409)
  const { data, error: e } = await createServiceClient().rpc('grant_iap_skin', {
    p_user: userId, p_txn: String(t.transactionId), p_original: String(t.originalTransactionId ?? t.transactionId),
    p_product: t.productId, p_env: t.environment, p_purchased: t.purchaseDate ? new Date(t.purchaseDate).toISOString() : null,
  })
  if (e) {
    if (e.message.includes('UNKNOWN_PRODUCT')) return err('Unknown skin.', 404)
    if (e.message.includes('TXN_OTHER_USER')) return err('That purchase belongs to a different account.', 403)
    if (e.message.includes('TXN_REFUNDED')) return err('That purchase was refunded.', 409)
    return err('Could not unlock the skin.', 500)
  }
  return ok({ ...(data as any), message: `${(data as any).skin} unlocked.` })
}
