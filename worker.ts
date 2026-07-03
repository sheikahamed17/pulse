// Custom worker entry: wraps the OpenNext-generated handler and adds scheduled().
// .open-next/worker.js is a build artifact (gitignored) — this file is excluded
// from tsconfig + eslint; wrangler's esbuild bundles it at deploy time.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore build artifact, exists only after `opennextjs-cloudflare build`
import handler from './.open-next/worker.js'
import { resolveCronRoute } from './src/lib/cron-dispatch'

const APP_ORIGIN = 'https://pulse.sdsheikahamed.workers.dev'

export default {
  fetch: handler.fetch,
  async scheduled(event: { cron: string }, env: { CRON_SECRET?: string }, ctx: unknown) {
    const path = resolveCronRoute(event.cron)
    if (!path) {
      console.error('[scheduled] unknown cron pattern:', event.cron)
      return
    }
    const req = new Request(APP_ORIGIN + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ''}` },
    })
    const res = await handler.fetch(req, env, ctx)   // in-process, no network hop
    console.log('[scheduled]', event.cron, '→', path, res.status)
  },
}
