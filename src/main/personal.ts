import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, extname, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { PersonalScene } from '@shared/types'

/**
 * Personal scenes (this PC only). A scene is a look plus a video for ONE song, kept OUTSIDE Lyra in
 *   %USERPROFILE%\LyraPersonal\<name>\     (or under the folder in the LYRA_PERSONAL_DIR environment variable)
 *     config.json   which song turns it on and how the video lines up with it (see PersonalScene)
 *     a video file and an optional cover picture, named in config.json ("video", "art")
 * There is nothing about any song, person or video in Lyra itself: with no folder there are no scenes and Lyra works as it
 * always did.
 */
const root = (): string => process.env['LYRA_PERSONAL_DIR'] || join(homedir(), 'LyraPersonal')
const NAME = /^[A-Za-z0-9_-]{1,40}$/

/** A file named in config.json, kept inside the scene's own folder (never a path that leaves it). */
function inside(dir: string, rel: unknown, exts: RegExp): string | null {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || !exts.test(rel)) return null
  const f = resolve(dir, rel)
  const r = relative(dir, f)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  try {
    return existsSync(f) && statSync(f).isFile() ? f : null
  } catch {
    return null
  }
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

interface Loaded {
  scene: PersonalScene
  video: string
  art: string | null
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
          const anchors = Array.isArray(c['videoAnchors'])
            ? (c['videoAnchors'] as unknown[]).filter((a): a is [number, number] => Array.isArray(a) && a.length === 2 && Number.isFinite(a[0]) && Number.isFinite(a[1]))
            : []
          const video = inside(dir, c['video'], /\.(mp4|webm)$/i)
          if (!m || typeof m.title !== 'string' || typeof m.artist !== 'string' || anchors.length < 2 || !video) continue
          const art = inside(dir, c['art'], /\.(jpe?g|png|webp)$/i)
          out.push({
            video,
            art,
            scene: {
              id: e.name,
              match: { title: m.title, artist: m.artist },
              anchors,
              loopFrom: num(c['loopFrom'], 2),
              loopTo: num(c['loopTo'], 60),
              videoDurationSec: num(c['videoDurationSec'], 60),
              videoNudgeSec: num(c['videoNudgeSec'], 0),
              lyricNudgeSec: num(c['lyricNudgeSec'], 0),
              videoUrl: `lyra-media://personal/${e.name}/video`,
              artUrl: art ? `lyra-media://personal/${e.name}/art` : null
            }
          })
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

/** The file behind lyra-media://personal/<id>/<video|art>; only what a scene's own config names. */
export function personalFile(id: string, kind: string): string | null {
  const l = load().find((x) => x.scene.id === id)
  if (!l) return null
  return kind === 'video' ? l.video : kind === 'art' ? l.art : null
}

const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/**
 * A file answered with HTTP Range support. A video that cannot be asked for "the part from here" cannot be sought, and the
 * scene's video is seeked all the time to stay with the song.
 */
export function fileResponse(file: string, rangeHeader: string | null): Response {
  const size = statSync(file).size
  const headers: Record<string, string> = { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as unknown as BodyInit, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  return new Response(Readable.toWeb(createReadStream(file)) as unknown as BodyInit, { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
}
