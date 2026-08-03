/**
 * POST /api/operator/venues/[venueId]/admins
 * Adds a bar admin by email. Creates the bar_admins row.
 * Operator only.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, requireOperator, ok, err } from '@/lib/challenges'

export async function POST(
  req: NextRequest,
  { params }: { params: { venueId: string } }
) {
  const { userId, error: authError } = await requireAuth()
  if (authError) return authError
  const opError = await requireOperator(userId!)
  if (opError) return opError

  const formData    = await req.formData().catch(() => null)
  const body        = formData ? null : await req.json().catch(() => null)
  const email: string = (formData?.get('email') ?? body?.email ?? '').toString().trim()

  if (!email) return err('email is required')

  const service = createServiceClient()

  // Look up user by email
  const { data: users } = await service.auth.admin.listUsers()
  const target = users?.users?.find(u => u.email === email)
  if (!target) return err(`No account found for ${email}. The user must sign up first.`, 404)

  // Verify venue exists
  const { data: venue } = await service.from('venues').select('id, name').eq('id', params.venueId).single()
  if (!venue) return err('Venue not found', 404)

  const { error: insertError } = await service.from('bar_admins').insert({
    user_id: target.id,
    bar_id:  params.venueId,
  })

  if (insertError) {
    if (insertError.code === '23505') return err('This user is already an admin of this venue', 409)
    return err(insertError.message, 500)
  }

  // Redirect back to venues page if this came from a form
  if (formData) {
    return new Response(null, { status: 302, headers: { Location: '/operator/venues' } })
  }

  return ok({ added: true, email, venue_id: params.venueId }, 201)
}
