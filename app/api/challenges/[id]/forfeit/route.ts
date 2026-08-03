/**
 * PATCH /api/challenges/[id]/forfeit
 * Operator marks a forfeit as paid after confirming offline.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, requireOperator, ok, err } from '@/lib/challenges'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError

  const operatorError = await requireOperator(userId!)
  if (operatorError) return operatorError

  const service = createServiceClient()

  const { data: challenge } = await service
    .from('bar_challenges')
    .select('status, forfeit_paid')
    .eq('id', params.id)
    .single()

  if (!challenge) return err('Challenge not found', 404)

  if (!['completed', 'forfeit_unpaid'].includes((challenge as any).status)) {
    return err('Challenge is not in a forfeit state', 422)
  }

  await service
    .from('bar_challenges')
    .update({ forfeit_paid: true, status: 'completed' })
    .eq('id', params.id)

  return ok({ id: params.id, forfeit_paid: true })
}
