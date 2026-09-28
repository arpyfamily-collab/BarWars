import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/** Chat page: is this war chat frozen (jam or Flare blackout), and can this player decrypt Command notices here? */
export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const { data: ch } = await s.from('channels').select('claim_id, channel_type, side').eq('id', params.channelId).maybeSingle()
  const c: any = ch
  if (!c?.claim_id || !['war_side', 'battlefield'].includes(c.channel_type)) return ok({ frozen_until: null, can_decrypt: false })
  const { data: st } = await s.rpc('comms_status', { p_user: userId, p_claim: c.claim_id })
  const x: any = st ?? {}
  const frozen = x.blackout_until ?? (c.channel_type === 'war_side' ? x[`${c.side}_frozen_until`] : null)
  return ok({
    frozen_until: frozen, reason: x.blackout_until ? 'blackout' : frozen ? 'jam' : null,
    can_decrypt: c.channel_type === 'war_side' && x.decrypt_side === c.side,
  })
}
