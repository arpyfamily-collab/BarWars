import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** GET /api/wallet → the caller's War Bond balances ({ valor, battle, legacy }) */
export async function GET() {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const { data } = await createServiceClient().from('war_bond_wallets').select('bond_type, balance').eq('owner_id', userId!)
  const out: Record<string, number> = { valor: 0, battle: 0, legacy: 0 }
  for (const w of (data as any[]) ?? []) out[w.bond_type] = w.balance
  return ok(out)
}
