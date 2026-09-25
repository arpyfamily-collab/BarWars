/**
 * middleware.ts (root level)
 *
 * Guards:
 *   /operator/*   — only profiles.is_staff = true
 *   /bar-admin/*  — user must have at least one row in bar_admins
 *
 * Also handles the Supabase session refresh on every request.
 */
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value)
          })
          res = NextResponse.next({ request: { headers: req.headers } })
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options as any)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname

  // Protect /operator routes
  if (path.startsWith('/operator')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login?next=/operator', req.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_staff')
      .eq('id', user.id)
      .single()

    if (!profile?.is_staff) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  // Protect /bar-admin routes
  if (path.startsWith('/bar-admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login?next=/bar-admin', req.url))
    }

    const { data: memberships } = await supabase
      .from('bar_admins')
      .select('bar_id')
      .eq('user_id', user.id)
      .limit(1)

    if (!memberships || memberships.length === 0) {
      return NextResponse.redirect(new URL('/?err=not_bar_admin', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/operator/:path*', '/bar-admin/:path*'],
}
