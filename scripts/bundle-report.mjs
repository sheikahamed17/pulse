#!/usr/bin/env node
/**
 * Bundle report — measures the ACTUAL shipped client JS per route (gzip
 * transfer size), split into framework / polyfill / app code.
 *
 * Why this exists: this repo builds with Turbopack, which prints no per-route
 * size table, and `@next/bundle-analyzer` only hooks webpack builds. So instead
 * of guessing, this reads the real build output — each prerendered route's HTML
 * → the `/_next/static` JS chunks it references → their gzip sizes, classified
 * via `.next/build-manifest.json` (rootMainFiles = framework, polyfillFiles =
 * the nomodule polyfill modern browsers skip).
 *
 * Usage:
 *   pnpm build          # produce .next/
 *   pnpm bundle:report  # print the table
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { globSync } from 'glob'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT = path.join(ROOT, '.next')
const HTML_DIR = path.join(NEXT, 'server', 'app')

if (!fs.existsSync(HTML_DIR)) {
  console.error('✘ No build found at .next/server/app — run `pnpm build` first.')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(path.join(NEXT, 'build-manifest.json'), 'utf8'))
const strip = (f) => f.replace(/^static\//, '')
const FRAMEWORK = new Set((manifest.rootMainFiles || []).map(strip))
const POLYFILL = new Set((manifest.polyfillFiles || []).map(strip))

const gzCache = new Map()
function gzOf(rel) {
  if (!gzCache.has(rel)) {
    try {
      gzCache.set(rel, zlib.gzipSync(fs.readFileSync(path.join(NEXT, rel))).length)
    } catch {
      gzCache.set(rel, 0)
    }
  }
  return gzCache.get(rel)
}
function kindOf(rel) {
  const bare = strip(rel)
  return FRAMEWORK.has(bare) ? 'framework' : POLYFILL.has(bare) ? 'polyfill' : 'app'
}
const kb = (n) => (n / 1024).toFixed(1)
const pad = (s, n) => String(s).padEnd(n)

const rows = []
for (const file of globSync('*.html', { cwd: HTML_DIR })) {
  const html = fs.readFileSync(path.join(HTML_DIR, file), 'utf8')
  const chunks = new Set([...html.matchAll(/\/_next\/(static\/[^"']+?\.js)/g)].map((m) => m[1]))
  const k = { framework: 0, polyfill: 0, app: 0 }
  for (const rel of chunks) k[kindOf(rel)] += gzOf(rel)
  const total = k.framework + k.polyfill + k.app
  rows.push({
    route: '/' + file.replace(/\.html$/, '').replace(/^index$/, ''),
    total,
    modern: total - k.polyfill, // modern browsers skip the nomodule polyfill
    app: k.app,
    poly: k.polyfill,
    n: chunks.size,
  })
}
rows.sort((a, b) => b.modern - a.modern)

let frameworkGz = 0
for (const bare of FRAMEWORK) frameworkGz += gzOf('static/' + bare)

console.log('\nBundle report — First Load JS per route, gzip transfer size (KB)')
console.log(`Framework shared by every route: ${kb(frameworkGz)} KB gz (React + Next runtime — fixed cost).`)
console.log('  modern = what a modern browser downloads (excludes the nomodule polyfill)')
console.log('  app    = route-specific app code — the part you can actually influence\n')
console.log('  ' + pad('modern', 9) + pad('total', 9) + pad('app', 8) + pad('poly', 8) + pad('#', 5) + 'route')
console.log('  ' + '─'.repeat(58))
for (const r of rows) {
  console.log(
    '  ' +
      pad(kb(r.modern), 9) +
      pad(kb(r.total), 9) +
      pad(kb(r.app), 8) +
      pad(kb(r.poly), 8) +
      pad(r.n, 5) +
      r.route,
  )
}
console.log('')
