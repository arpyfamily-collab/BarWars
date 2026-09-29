import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyAppleJWS, APPLE_BUNDLE_ID } from '@/lib/apple-jws'

export const dynamic = 'force-dynamic'

/**
 * App Store Server Notifications V2 (set this URL in App Store Connect → App Information):
 *   https://app.barwars.app/api/apple/notifications
 * A refund or revocation removes the skin it paid for. Everything is verified against Apple's signature.
 */
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  let n: any, t: any
  try {
    n = verifyAppleJWS(body.signedPayload)
    t = n?.data?.signedTransactionInfo ? verifyAppleJWS(n.data.signedTransactionInfo) : null
  } catch { return NextResponse.json({ error: 'unverified' }, { status: 400 }) }
  if (n?.data?.bundleId && n.data.bundleId !== APPLE_BUNDLE_ID) return NextResponse.json({ ok: true, ignored: 'bundle' })
  if (t && ['REFUND', 'REVOKE'].includes(n.notificationType)) {
    await createServiceClient().rpc('revoke_iap_skin', { p_txn: String(t.transactionId) })
  }
  return NextResponse.json({ ok: true })   // Apple retries anything that isn't 200
}
