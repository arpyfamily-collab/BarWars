import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAuth, ok, err } from '@/lib/challenges'

export const dynamic = 'force-dynamic'

/**
 * University email status (item 11, Sep 28).
 * The old version handed back a "dev_verify_url", so anyone could verify any .edu address.
 * Now an account is .edu-verified only when its confirmed login email is on an allowed domain
 * (@olemiss.edu for the Oxford pilot). Players switch their login email in the app, and Supabase
 * sends the confirmation link to that inbox. One .edu = one account, since login emails are unique.
 * GET → { edu_verified, email, domains, gate_enabled }
 */
export async function GET() {
  const { userId, error } = await requireAuth()
  if (error) return error
  const s = createServiceClient()
  const [{ data: okEdu }, { data: setting }, { data: user }] = await Promise.all([
    s.rpc('edu_email_ok', { p_user: userId }),
    s.from('app_settings').select('value').eq('key', 'edu_gate').maybeSingle(),
    s.auth.admin.getUserById(userId!),
  ])
  const v: any = (setting as any)?.value ?? {}
  return ok({ edu_verified: !!okEdu, email: user?.user?.email ?? null, new_email_pending: (user?.user as any)?.new_email ?? null,
              domains: v.domains ?? ['olemiss.edu'], gate_enabled: !!v.enabled })
}

export async function POST(_req: NextRequest) {
  return err('Switch your login email to your university address to verify it.', 410)
}
