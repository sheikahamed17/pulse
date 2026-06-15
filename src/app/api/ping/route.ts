// NO runtime = 'edge' — OpenNext makes the entire Worker edge-runtime
// regardless. Adding the directive causes the bundle to fight itself
// (TypeError: Cannot read properties of undefined (reading 'default')).
export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response('pong', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
}
