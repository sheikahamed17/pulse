import { NextResponse, type NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { middlewareRedirect } from '@/lib/setup'

// First-run gate: until an owner account exists in D1, force every route to the
// /setup wizard so a new self-hoster's first action is creating their account.
// The zero-user → has-user transition is one-way, so once we've seen an owner
// we cache it for this isolate and stop querying D1 on every request.
let ownerExists = false

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Static assets (anything with a file extension: .js/.png/.svg/.webmanifest…)
  // never gate — the wizard needs its own assets while no user exists.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next()

  let usersExist = ownerExists
  if (!usersExist) {
    const db = (getCloudflareContext().env as { DB?: D1Database }).DB
    // Fail open — a missing binding must never lock the whole app out.
    if (!db) return NextResponse.next()
    const row = await db.prepare('SELECT 1 FROM user LIMIT 1').first()
    usersExist = Boolean(row)
    if (usersExist) ownerExists = true
  }

  const target = middlewareRedirect({ usersExist, pathname })
  if (target && target !== pathname) {
    const url = req.nextUrl.clone()
    url.pathname = target
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Run on everything except Next internals; the setup allowlist (/setup,
  // /api/setup, /api/auth, /api/health) is enforced inside middlewareRedirect,
  // and static assets are skipped by the extension check above.
  matcher: ['/((?!_next/|favicon.ico).*)'],
}
