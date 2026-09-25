import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const cookieStore = cookies()
  const allCookies = cookieStore.getAll()
  const cookieNames = allCookies.map(c => c.name)

  const headerStore = headers()
  const authHeader = headerStore.get('authorization')
  const authorizationHeaderPresent = !!authHeader

  const supabase = createServerSupabaseClient()

  let userId: string | null = null
  let getUserError: string | null = null

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      getUserError = error.message
    } else {
      userId = data.user?.id ?? null
    }
  } catch (e: any) {
    getUserError = e?.message ?? String(e)
  }

  return NextResponse.json({
    supabaseUrl,
    anonKeyPrefix: anonKey ? anonKey.slice(0, 12) : null,
    cookieNames,
    authorizationHeaderPresent,
    getUser: userId ?? getUserError,
  })
}
