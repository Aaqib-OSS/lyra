// Bundle report: builds the renderer with source maps into a temp dir and prints, per output chunk, its size and how many
// bytes each package / folder contributes (attributed through the source map, so numbers are approximate but comparable).
//   node scripts/perf/bundle.mjs            (also: --top=12)
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const out = join(root, 'perf-out', 'bundle')
rmSync(out, { recursive: true, force: true })
await build({
  root: resolve(root, 'src/renderer'),
  logLevel: 'error',
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(root, 'src/shared'), '@core': resolve(root, 'src/core'), '@': resolve(root, 'src/renderer/src') } },
  build: { outDir: out, emptyOutDir: true, sourcemap: true, rollupOptions: { input: resolve(root, 'src/renderer/index.html') } }
})

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function vlq(str) {
  const res = []
  let shift = 0, val = 0
  for (const ch of str) {
    const d = B64.indexOf(ch)
    val += (d & 31) << shift
    if (d & 32) shift += 5
    else { res.push(val & 1 ? -(val >> 1) : val >> 1); shift = 0; val = 0 }
  }
  return res
}
const label = (s) => {
  const m = s.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
  if (m) return m[1]
  const r = s.replace(/\\/g, '/').match(/src\/(renderer\/src\/[^/]+|shared|core)/)
  return r ? r[1] : s
}
const assets = join(out, 'assets')
const rows = []
for (const f of readdirSync(assets).filter((x) => x.endsWith('.js'))) {
  const code = readFileSync(join(assets, f), 'utf8')
  const map = JSON.parse(readFileSync(join(assets, f + '.map'), 'utf8'))
  const lines = code.split('\n')
  const per = {}
  let src = 0
  for (let li = 0; li < map.mappings.split(';').length; li++) {
    const segs = map.mappings.split(';')[li].split(',').filter(Boolean)
    let col = 0
    const decoded = segs.map((s) => { const v = vlq(s); col += v[0]; if (v.length > 1) src += v[1]; return { col, src: v.length > 1 ? src : -1 } })
    const line = lines[li] ?? ''
    decoded.forEach((d, i) => {
      const end = i + 1 < decoded.length ? decoded[i + 1].col : line.length
      if (d.src >= 0) { const k = label(map.sources[d.src]); per[k] = (per[k] ?? 0) + (end - d.col) }
    })
  }
  rows.push({ f, size: statSync(join(assets, f)).size, per })
}
rows.sort((a, b) => b.size - a.size)
const kb = (n) => (n / 1024).toFixed(1) + ' kB'
for (const r of rows) {
  console.log(`\n${r.f}  ${kb(r.size)}`)
  for (const [k, v] of Object.entries(r.per).sort((a, b) => b[1] - a[1]).slice(0, Number(args.top ?? 8))) console.log(`   ${kb(v).padStart(10)}  ${k}`)
}
const css = readdirSync(assets).filter((x) => x.endsWith('.css')).map((x) => `${x} ${kb(statSync(join(assets, x)).size)}`)
console.log('\nCSS:', css.join(', '))
