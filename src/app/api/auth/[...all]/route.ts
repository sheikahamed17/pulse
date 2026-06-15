import { handler as authHandler } from '@/lib/auth'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

async function safeHandler(req: Request) {
  try {
    return await authHandler(req)
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n\nStack:\n${err.stack}` : String(err)
    return new Response(`[DEBUG AUTH ERROR]\n\n${msg}`, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    })
  }
}

export const GET = safeHandler
export const POST = safeHandler
