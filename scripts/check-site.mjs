// Static check of website/: every file the pages, scripts and styles point at exists, nothing in assets/ is unused,
// the look shots are complete, and the numbers written into the HTML match the look data.
//   node scripts/check-site.mjs        (exit code 1 on any problem)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, posix, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'website')
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const all = walk(site)
const rel = (f) => relative(site, f).replace(/\\/g, '/')
const read = (f) => readFileSync(join(site, f), 'utf8')
const problems = []
const fail = (m) => problems.push(m)

const ctx = { window: {} }
vm.runInNewContext(read('vibes-data.js'), ctx)
const vibes = ctx.window.LYRA_VIBES
const N = vibes.length

// ---- references ----
const used = new Set()
const missing = []
const clips = [...read('index.html').matchAll(/data-clip="(\w+)"/g)].map((m) => m[1])
const shotNames = (id) => [`${id}-full`, `${id}-full-800`, `${id}-full-novideo`, `${id}-phone`, `${id}-mini`, `${id}-plain`, `${id}-nolyrics`, `settings-${id}`, `card-${id}`, `tile-${id}`]
const templated = [
  ...vibes.flatMap((v) => shotNames(v.id).map((n) => `assets/shots/${n}.webp`)),
  ...clips.flatMap((k) => [`assets/clip-${k}.mp4`, `assets/poster-${k}.webp`]),
  'assets/poster-song.webp'
]
templated.forEach((f) => { used.add(f); if (!existsSync(join(site, f))) missing.push(`${f} (generated for the looks / clips)`) })

for (const f of all.filter((x) => /\.(html|css|js|json|webmanifest|xml|txt)$/.test(x))) {
  const file = rel(f)
  const text = readFileSync(f, 'utf8')
  const base = posix.dirname(file)
  const refs = []
  if (file.endsWith('.html')) for (const m of text.matchAll(/\b(?:src|href|poster|imagesrcset|srcset)="([^"]+)"/g)) refs.push(...(/srcset/i.test(m[0]) ? m[1].split(',').map((s) => s.trim().split(/\s+/)[0]) : [m[1]]))
  if (file.endsWith('.html')) for (const m of text.matchAll(/https:\/\/lyra-website-rho\.vercel\.app\/(assets\/[A-Za-z0-9_./-]+)/g)) refs.push('/' + m[1])
  if (file.endsWith('.html') || file.endsWith('.js')) for (const m of text.matchAll(/['"`(]((?:\.\.?\/|\/)?assets\/[A-Za-z0-9_./-]+\.[a-z0-9]+)/g)) refs.push(m[1])
  if (file.endsWith('.css')) for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(m[1])
  if (file.endsWith('.webmanifest')) for (const m of text.matchAll(/"src":\s*"([^"]+)"/g)) refs.push(m[1])
  for (let r of refs) {
    if (!r || /^(https?:|data:|mailto:|#|%23|\/\/)/.test(r) || r.includes('${')) continue
    r = r.split('#')[0].split('?')[0]
    if (!r) continue
    const target = r.startsWith('/') ? r.slice(1) : posix.normalize(posix.join(file.endsWith('.css') ? base : base, r))
    // pages are served without the extension (cleanUrls): ./ and vibes, whats-new, room
    if (!extname(target)) { const page = target === '.' || target === './' || target === '' ? 'index.html' : `${target}.html`; if (!existsSync(join(site, page))) missing.push(`${file}: ${r}`); continue }
    used.add(target)
    if (!existsSync(join(site, target))) missing.push(`${file}: ${r}`)
  }
}
missing.forEach((m) => fail(`missing file: ${m}`))

// ---- unreferenced assets ----
const peer = read('room.html').includes('assets/peerjs.min.js')
for (const f of all.filter((x) => rel(x).startsWith('assets/'))) {
  const r = rel(f)
  if (!used.has(r) && !(r === 'assets/peerjs.min.js' && peer)) fail(`unreferenced asset: ${r}`)
}
// ---- sanity of the generated data ----
for (const v of vibes) for (const k of ['id', 'name', 'tag', 'layout', 'stage', 'acc', 'c2', 'c3']) if (!v[k]) fail(`vibes-data: ${v.id} has no ${k}`)
for (const v of vibes) if (/draft/i.test(v.tag)) fail(`vibes-data: ${v.id} tag still says draft: ${v.tag}`)
// ---- the numbers written in the HTML (the no-JS text) must equal the data ----
for (const page of ['index.html', 'vibes.html']) {
  for (const m of read(page).matchAll(/(\d+)(?:<\/span>)?,? (?:hand-designed )?looks|All (\d+)|data-count="(\d+)"|The (\d+) looks|(\d+) designed looks/g)) {
    const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5])
    if (n !== N && n !== 4 && n !== 3) fail(`${page}: says ${n} looks, the data has ${N} (${m[0]})`)
  }
}
const list = (read('index.html').match(/<!--looks:start-->([\s\S]*?)<!--looks:end-->/) || [])[1] || ''
if ((list.match(/<li>/g) || []).length !== N) fail(`index.html no-JS list has ${(list.match(/<li>/g) || []).length} looks, the data has ${N} (run: node scripts/make-site-shots.mjs --lists-only)`)

// ---- HTML rules: meta tags, alt text, landmarks, in-page links, external links, sitemap, headers ----
const pages = all.filter((x) => x.endsWith('.html')).map(rel)
for (const page of pages) {
  const h = read(page)
  const noindex = /<meta name="robots" content="noindex"/.test(h)
  const needs = ['<title>', '<meta name="description"', '<meta name="viewport"', '<html lang=']
  if (!noindex || page === 'room.html') needs.push('<meta property="og:title"', '<meta property="og:image"', '<meta name="twitter:card"')
  if (!noindex) needs.push('<link rel="canonical"')
  for (const n of needs) if (!h.includes(n)) fail(`${page}: missing ${n}`)
  if (!/<main[\s>]/.test(h)) fail(`${page}: no <main> landmark`)
  for (const m of h.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(m[0])) fail(`${page}: <img> without alt: ${m[0].slice(0, 90)}`)
    if (!/\swidth=/.test(m[0]) || !/\sheight=/.test(m[0])) fail(`${page}: <img> without width/height (layout shift): ${m[0].slice(0, 90)}`)
  }
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
  for (const m of h.matchAll(/\shref="#([^"]+)"/g)) if (!ids.has(m[1])) fail(`${page}: href="#${m[1]}" has no matching id`)
  for (const m of h.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0])) fail(`${page}: target=_blank without noopener: ${m[0].slice(0, 90)}`)
  if (/<script\b(?![^>]*\b(?:src|type)=)[^>]*>/.test(h) && page !== 'room.html') fail(`${page}: inline script (the CSP only allows it on room.html)`)
}
const sitemap = read('sitemap.xml')
for (const p of pages.filter((x) => !/^(404|room)\./.test(x))) {
  const url = p === 'index.html' ? '/' : `/${p.replace('.html', '')}`
  if (!sitemap.includes(`https://lyra-website-rho.vercel.app${url}</loc>`)) fail(`sitemap.xml: ${url} is missing`)
}
if (!/<lastmod>/.test(sitemap)) fail('sitemap.xml: no lastmod')
const vj = JSON.parse(read('vercel.json'))
const hdr = vj.headers.flatMap((h) => h.headers.map((x) => x.key))
for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy', 'Cache-Control']) if (!hdr.includes(k)) fail(`vercel.json: no ${k} header`)
if (!/application\/ld\+json/.test(read('index.html'))) fail('index.html: no structured data (JSON-LD)')

// ---- weight ----
const kb = (n) => `${(n / 1024).toFixed(0)} KB`
const total = all.reduce((n, f) => n + statSync(f).size, 0)
const by = (re) => all.filter((f) => re.test(rel(f))).reduce((n, f) => n + statSync(f).size, 0)
console.log(`${all.length} files, ${(total / 1048576).toFixed(1)} MB (shots ${kb(by(/^assets\/shots\//))}, videos ${(by(/\.mp4$/) / 1048576).toFixed(1)} MB, fonts ${kb(by(/^assets\/fonts\//))}); ${N} looks`)
if (problems.length) { console.error(problems.map((p) => `FAIL ${p}`).join('\n')); process.exit(1) }
console.log('site check OK')
