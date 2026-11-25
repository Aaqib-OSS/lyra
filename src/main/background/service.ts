import { BrowserWindow, app, dialog, net, protocol } from 'electron'
import { nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BackgroundMedia, BackgroundResolution, BackgroundSpec, Track, YoutubeVideo } from '@shared/types'
import { JsonStore } from '../jsonStore'
import { ClipStore } from './clipStore'
import { createLogger } from '../logger'
import { fileResponse, personalFile } from '../personal'
import { settings } from '../settings'
import { thumbCrop } from '@core/background/bars'
import { HOST_RE } from '@core/background/itunes'
import { createBackgroundResolver, type SongBg } from '@core/background/resolver'
import { keyForId } from '@core/trackIndex'
import { failedVideos } from '@core/background/failedVideos'
import { userChoices } from '@core/userChoices'

const log = createLogger('background')

export const BG_SCHEME = 'lyra-media'
const MAX_BYTES = 200 * 1024 * 1024
const VIDEO = new Set(['.mp4', '.webm'])
const IMAGE = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp', '.apng'])
const NAME_RE = /^[a-f0-9]{16}\.(mp4|webm|gif|png|jpe?g|webp|apng)$/i

/** Must run before app is ready. */
export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: BG_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }])
}

const CLIP_MAX_FILES = 80
/** Apple's HD preview clips are about 20 MB (1920w, 30 s). */
const CLIP_MAX_BYTES = 64 * 1024 * 1024
/** The whole clip folder stays under this (oldest clips go first). */
const CLIP_CACHE_BYTES = 500 * 1024 * 1024

class BackgroundService {
  /**
   * Apple preview clips: ONE download per clip, played while it downloads and kept on disk for the next time (see clipStore.ts).
   * Playing from the first bytes (instead of waiting for all ~20 MB) is what makes the clip start at once.
   */
  private clipsStore: ClipStore | null = null
  private get clips(): ClipStore {
    return (this.clipsStore ??= new ClipStore({
      dir: join(app.getPath('userData'), 'clipcache'),
      fetch: (u, i) => net.fetch(u, i),
      log: { warn: (m, d) => log.warn(m, d), info: (m, d) => log.info(m, d) },
      maxBytes: CLIP_MAX_BYTES,
      onSaved: () => this.clipsStore?.tidy(CLIP_MAX_FILES, CLIP_CACHE_BYTES)
    }))
  }
  /** Start saving a clip now; everyone who asks for it while it downloads shares that one download. */
  warmClip(target: string): void {
    if (HOST_RE.test(target)) this.clips.ensure(target)
  }

  clipCacheInfo(): { files: number; bytes: number } {
    return this.clips.info()
  }
  clipCacheClear(): void {
    this.clips.clear()
  }

  private store: JsonStore<{ songs: Record<string, SongBg> }> | null = null

  private get dir(): string {
    const d = join(app.getPath('userData'), 'backgrounds')
    mkdirSync(d, { recursive: true })
    return d
  }
  private songs(): Record<string, SongBg> {
    return (this.store ??= new JsonStore<{ songs: Record<string, SongBg> }>('backgrounds.json', { songs: {} })).get().songs
  }
  /** The keys a choice is stored under: the player's track id and the song's identity (when we know it). */
  private idsFor(trackId: string): string[] {
    const key = keyForId(trackId)
    return key ? [trackId, key] : [trackId]
  }
  private save(songs: Record<string, SongBg>): void {
    this.store!.set({ songs })
  }

  /**
   * lyra-media://bg/<hash>.<ext>   -> a file Lyra copied into userData/backgrounds
   * lyra-media://preview/<base64url> -> a streamed (never stored) Apple preview clip, host-checked
   * Both answer with CORS headers so the renderer may read frames (brightness / letterbox detection).
   */
  registerProtocol(): void {
    this.clips.tidy(CLIP_MAX_FILES, CLIP_CACHE_BYTES) // unfinished downloads of an earlier run, and the size limit
    const cors = (res: Response): Response => {
      const h = new Headers()
      for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = res.headers.get(k)
        if (v) h.set(k, v)
      }
      h.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, headers: h })
    }
    const range = (req: Request): Record<string, string> => {
      const r = req.headers.get('range')
      return r ? { range: r } : {}
    }
    protocol.handle(BG_SCHEME, async (req) => {
      try {
        const u = new URL(req.url)
        const name = decodeURIComponent(u.pathname.replace(/^\//, ''))
        if (u.hostname === 'bg') {
          if (!NAME_RE.test(name)) return new Response('not found', { status: 404 })
          const file = join(this.dir, name)
          if (!existsSync(file)) return new Response('not found', { status: 404 })
          return cors(await net.fetch(pathToFileURL(file).toString(), { headers: range(req) }))
        }
        if (u.hostname === 'personal') {
          // this PC's own scene files (src/main/personal.ts): <scene>/files/<path inside that scene's folder>
          // a tiny empty page the app opens once in a hidden frame, so the frame process is already running when a scene starts
          if (name === 'warm') return new Response('<!doctype html><meta charset="utf-8">', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'" } })
          const [sceneId = '', dir = '', ...rest] = name.split('/')
          const f = dir === 'files' ? personalFile(sceneId, rest.join('/')) : null
          if (!f) return new Response('not found', { status: 404 })
          return fileResponse(f, req.headers.get('range'))
        }
        if (u.hostname === 'preview') {
          const target = Buffer.from(name, 'base64url').toString('utf8')
          if (!HOST_RE.test(target)) return new Response('forbidden', { status: 403 })
          // 1) the clip is saved: play it from disk
          const local = this.clips.localFile(target)
          if (local) return cors(await net.fetch(pathToFileURL(local).toString(), { headers: range(req) }))
          // 2) it is downloading (or starts now): play it from the first bytes while the rest arrives
          const live = await this.clips.serve(target, req.headers.get('range'), req.signal)
          if (live) return cors(live)
          // 3) saving it did not work (refused, too big): stream it straight from Apple so the player still gets its picture
          return cors(await net.fetch(target, { headers: range(req) }))
        }
        return new Response('not found', { status: 404 })
      } catch (e) {
        log.warn('media request failed', (e as Error).message)
        return new Response('upstream failed', { status: 502 })
      }
    })
  }

  private mediaSpec(m: BackgroundMedia, scope: 'song' | 'global'): BackgroundSpec | null {
    if (!NAME_RE.test(m.file) || !existsSync(join(this.dir, m.file))) return null
    return { kind: 'media', url: `${BG_SCHEME}://bg/${m.file}`, media: m.kind, name: m.name, scope }
  }

  private readonly resolver = createBackgroundResolver({
    settings: () => settings.get(),
    songs: () => this.songs(),
    mediaSpec: (m, scope) => this.mediaSpec(m, scope),
    clipUrl: (url) => `${BG_SCHEME}://preview/${Buffer.from(url).toString('base64url')}`,
    crop: (videoId) =>
      thumbCrop(videoId, async (bytes) => {
        const img = nativeImage.createFromBuffer(Buffer.from(bytes))
        const { width, height } = img.getSize()
        return width > 0 ? { width, height, pixels: img.toBitmap(), order: 'bgra' as const } : null
      })
  })

  async resolve(track: Track): Promise<BackgroundResolution> {
    const r = await this.resolver(track)
    // start saving the clip now, while the renderer is still setting up: by the time the video asks for it, it is local
    for (const sp of [r.spec, r.fallback]) {
      if (sp?.kind !== 'preview') continue
      try {
        const t = Buffer.from(new URL(sp.url).pathname.replace(/^\//, ''), 'base64url').toString('utf8')
        this.warmClip(t)
      } catch {
        /* not a clip url */
      }
    }
    return r
  }

  /** Let the user choose a file; it is COPIED into Lyra's own folder (nothing outside it is ever read later). */
  async pick(scope: 'song' | 'global', trackId?: string): Promise<{ ok: boolean; error?: string }> {
    const win = BrowserWindow.getAllWindows()[0]
    const opts: Electron.OpenDialogOptions = {
      title: scope === 'song' ? 'Choose a background for this song' : 'Choose a background for all songs',
      properties: ['openFile'],
      filters: [{ name: 'Images, GIFs & video', extensions: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg', 'webp'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    return this.importFile(r.filePaths[0], scope, trackId)
  }

  async importFile(path: string, scope: 'song' | 'global', trackId?: string): Promise<{ ok: boolean; error?: string }> {
    const ext = extname(path).toLowerCase()
    const kind = VIDEO.has(ext) ? 'video' : IMAGE.has(ext) ? 'image' : null
    if (!kind) return { ok: false, error: 'Use an MP4, WebM, GIF, PNG, JPG or WebP file.' }
    let size: number
    try {
      size = statSync(path).size
    } catch {
      return { ok: false, error: 'Couldn’t read that file.' }
    }
    if (size > MAX_BYTES) return { ok: false, error: `That file is ${Math.round(size / 1048576)} MB. The limit is 200 MB.` }
    if (scope === 'song' && !trackId) return { ok: false, error: 'No song selected.' }

    const hash = createHash('sha256')
    await new Promise<void>((res, rej) => createReadStream(path).on('data', (c) => hash.update(c)).on('end', () => res()).on('error', rej))
    const file = `${hash.digest('hex').slice(0, 16)}${ext === '.jpeg' ? '.jpg' : ext}`
    if (!existsSync(join(this.dir, file))) copyFileSync(path, join(this.dir, file))
    const media: BackgroundMedia = { file, name: path.split(/[\\/]/).pop()!.slice(0, 120), kind }

    if (scope === 'global') settings.update({ customBackground: media })
    else {
      const songs = this.songs()
      for (const k of this.idsFor(trackId!)) songs[k] = { ...songs[k], media }
      this.save(songs)
    }
    this.collectGarbage()
    return { ok: true }
  }

  clear(scope: 'song' | 'global', trackId?: string): void {
    if (scope === 'global') settings.update({ customBackground: null })
    else if (trackId) {
      const songs = this.songs()
      for (const k of this.idsFor(trackId)) {
        if (!songs[k]) continue
        delete songs[k]!.media
        if (!songs[k]!.youtube) delete songs[k]
      }
      this.save(songs)
    }
    this.collectGarbage()
  }

  chooseYoutube(trackId: string, video: YoutubeVideo | null): void {
    const sk = keyForId(trackId)
    if (sk) {
      userChoices().setChoice(sk, { video: video ? { videoId: video.videoId } : null })
      // picking a video by hand gives it another chance; going back to automatic forgets what failed for the song
      failedVideos().forget(sk, video?.videoId)
    }
    const songs = this.songs()
    for (const k of this.idsFor(trackId)) {
      if (video) songs[k] = { ...songs[k], youtube: video }
      else if (songs[k]) {
        delete songs[k]!.youtube
        if (!songs[k]!.media) delete songs[k]
      }
    }
    this.save(songs)
  }

  /** Delete copied files nothing refers to any more. */
  collectGarbage(): void {
    try {
      const used = new Set<string>()
      const g = settings.get().customBackground
      if (g) used.add(g.file)
      for (const v of Object.values(this.songs())) if (v.media) used.add(v.media.file)
      for (const f of readdirSync(this.dir)) if (!used.has(f)) rmSync(join(this.dir, f), { force: true })
    } catch (e) {
      log.warn('cleanup failed', (e as Error).message)
    }
  }
}

export const background = new BackgroundService()
