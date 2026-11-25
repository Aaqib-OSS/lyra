import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { PersonalScene } from '@shared/types'

/**
 * Personal scenes (this PC only). A scene is a web page, made by you, that Lyra shows instead of its own screen while ONE
 * song plays. It lives OUTSIDE Lyra, in
 *   %USERPROFILE%\LyraPersonal\<name>\     (or under the folder in the LYRA_PERSONAL_DIR environment variable)
 *     config.json   {"match": {"title", "artist"}, "page": "web/index.html"}  (any other keys are for your page to read)
 *     ...           the page, its styles, scripts, fonts, pictures and video: anything under that folder
 * so the look can be changed at any time, without a new Lyra. The page runs in a sandboxed frame (no access to Lyra, no network)
 * and talks to Lyra through a small message bridge (docs/personal-scenes.md).
 * There is nothing about any song, person or video in Lyra itself: with no folder there are no scenes and Lyra works as it always did.
 */
const root = (): string => process.env['LYRA_PERSONAL_DIR'] || join(homedir(), 'LyraPersonal')
const NAME = /^[A-Za-z0-9_-]{1,40}$/

/** What a scene folder may serve (by file type), with the type to send. No scripts run outside the frame, nothing executable is served. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
}

/** The page may load only from Lyra's own media scheme: nothing from the internet, no frames, no forms. */
const PAGE_CSP = "default-src 'none'; script-src lyra-media: 'unsafe-inline'; style-src lyra-media: 'unsafe-inline'; img-src lyra-media: data: blob:; media-src lyra-media: blob:; font-src lyra-media: data:; connect-src lyra-media:; frame-src 'none'; form-action 'none'; base-uri 'none'"

/** A file inside the scene's own folder (never a path that leaves it). */
function inside(dir: string, rel: unknown): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || isAbsolute(rel)) return null
  const f = resolve(dir, rel)
  const r = relative(dir, f)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  try {
    return existsSync(f) && statSync(f).isFile() ? f : null
  } catch {
    return null
  }
}

interface Loaded {
  scene: PersonalScene
  dir: string
}
let cache: { at: number; base: string; value: Loaded[] } | null = null

function load(): Loaded[] {
  const base = root()
  if (cache && cache.base === base && Date.now() - cache.at < 2000) return cache.value
  const out: Loaded[] = []
  try {
    if (existsSync(base)) {
      for (const e of readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory() || !NAME.test(e.name)) continue
        const dir = join(base, e.name)
        try {
          const cfgFile = join(dir, 'config.json')
          if (!existsSync(cfgFile)) continue
          const c = JSON.parse(readFileSync(cfgFile, 'utf8')) as Record<string, unknown>
          const m = c['match'] as { title?: unknown; artist?: unknown } | undefined
          const page = typeof c['page'] === 'string' ? c['page'] : 'web/index.html'
          if (!m || typeof m.title !== 'string' || typeof m.artist !== 'string' || !inside(dir, page) || !TYPES[extname(page).toLowerCase()]?.startsWith('text/html')) continue
          const bg = typeof c['background'] === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c['background']) ? c['background'] : '#0d0c10'
          out.push({ dir, scene: { id: e.name, match: { title: m.title, artist: m.artist }, background: bg, pageUrl: `lyra-media://personal/${e.name}/files/${page.split(/[\\/]/).map(encodeURIComponent).join('/')}` } })
        } catch {
          /* a scene with a broken config is skipped */
        }
      }
    }
  } catch {
    /* no folder, no scenes */
  }
  cache = { at: Date.now(), base, value: out }
  return out
}

/** Every scene found on this PC (usually none). */
export function personalScenes(): PersonalScene[] {
  return load().map((l) => l.scene)
}

/** The file behind lyra-media://personal/<id>/files/<path>: only inside that scene's folder and only of a known type. */
export function personalFile(id: string, rel: string): string | null {
  const l = load().find((x) => x.scene.id === id)
  if (!l || !TYPES[extname(rel).toLowerCase()]) return null
  return inside(l.dir, rel)
}

/**
 * A file answered with HTTP Range support (a video that cannot be asked for "the part from here" cannot be seeked), the right
 * type, and a policy that keeps a page inside Lyra's own scheme.
 */
export function fileResponse(file: string, rangeHeader: string | null): Response {
  const size = statSync(file).size
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }
  if (type.startsWith('text/html')) headers['Content-Security-Policy'] = PAGE_CSP
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as unknown as BodyInit, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  return new Response(Readable.toWeb(createReadStream(file)) as unknown as BodyInit, { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
}
