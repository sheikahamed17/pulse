import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Lightweight liveness check. Allowlisted by the first-run gate so an uptime
// monitor keeps working before the instance's owner account exists.
export function GET() {
  return NextResponse.json({ ok: true })
}
