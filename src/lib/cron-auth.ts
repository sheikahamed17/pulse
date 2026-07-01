// Shared bearer-token auth for cron routes. Web Crypto lacks
// crypto.timingSafeEqual (Node-only); a length-equal XOR loop is the
// portable constant-time equivalent.
export function isAuthorizedCron(req: Request, env: { CRON_SECRET?: string }): boolean {
  const auth = req.headers.get('authorization')
  if (!auth || !env.CRON_SECRET) return false
  const expected = `Bearer ${env.CRON_SECRET}`
  if (auth.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < auth.length; i++) {
    mismatch |= auth.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
