import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { R2Bucket } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Next 16: dynamic route params are async — they MUST be awaited before access.
  // (Accessing params.key synchronously yields undefined on Next 16.)
  const { key: keyParts } = await params
  const key = keyParts.join('/')
  const userId = session.user.id

  // Verify the key starts with the user's ID (path prefix check)
  if (!key.startsWith(userId + '/')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { env } = getCloudflareContext()
  const r2 = (env as { RECEIPTS: R2Bucket }).RECEIPTS
  if (!r2) return NextResponse.json({ error: 'r2_not_configured' }, { status: 500 })

  const obj = await r2.get(key)
  if (!obj) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return new Response(obj.body as BodyInit, {
    status: 200,
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'private, max-age=86400',
    },
  })
}
