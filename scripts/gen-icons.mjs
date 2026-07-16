import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const svg = readFileSync(join(here, 'logo-icon.svg'), 'utf8')

const targets = [
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  { out: 'public/icons/maskable-512.png', size: 512 },
  { out: 'src/app/apple-icon.png', size: 180 },
]

for (const { out, size } of targets) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(join(root, out), png)
  console.log(`wrote ${out} — ${size}px, ${png.length} bytes`)
}
