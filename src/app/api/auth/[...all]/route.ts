import { handler } from '@/lib/auth'

// Do NOT use `runtime = 'edge'` with OpenNext — OpenNext bundles the whole
// app for the Workers runtime regardless, and the Next.js edge transform
// fights OpenNext's wrapper, leaving `default` as undefined at runtime
// (TypeError: Cannot read properties of undefined). `dynamic` is enough
// to prevent static analysis.
export const dynamic = 'force-dynamic'

export const GET = handler
export const POST = handler
