/**
 * middleware.ts (root level)
 *
 * Guards:
 *   every app page — must be signed in; signed-out visitors go to /login first
 *                    (public: /login, /privacy, /review)
 *   /operator/*    — only profiles.is_staff = true
 *   /bar-admin/*   — user must have at least one row in bar_admins
 *
 * Also handles the Supabase session refresh on every request.
 */
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Features switched off for the Nov 7 launch (Brian, Sep 30): Bar Challenges, Mystery Drops, Predictions and
// game-day demand scores never ran (unscheduled, and Bar Challenges' scoring function is missing). Pages go
// home; their API routes answer 404. Remove a prefix here to bring a feature back.
const OFF_PAGES = ['/challenge', '/war-room', '/predictions', '/drops', '/operator/challenges']
const OFF_APIS = ['/api/challenges', '/api/drops', '/api/predictions']
const under = (path: string, prefixes: string[]) => prefixes.some(p => path === p || path.startsWith(p + '/'))

export async function middleware(req: NextRequest) {
  const reqPath = req.nextUrl.pathname
  if (under(reqPath, OFF_APIS)) return NextResponse.json({ error: 'This feature is not available.' }, { status: 404 })
  if (under(reqPath, OFF_PAGES)) return NextResponse.redirect(new URL(reqPath.startsWith('/operator') ? '/operator' : '/', req.url))
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

  // Everyone starts at the sign-in / sign-up screen until they have an account session
  // /watch: public Watch Links for Turf Wars (To-Do item 18), no account needed to watch
  const PUBLIC_PATHS = ['/login', '/privacy', '/review', '/watch']
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
  if (!user && !isPublic) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', path + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

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
  // All pages except Next.js internals, API routes (they check auth themselves) and static files
  matcher: [
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest|js|css|map|woff2?|pdf)$).*)',
    '/api/challenges/:path*', '/api/drops/:path*', '/api/predictions/:path*',
  ],
}
