// Browser harness: runs the real renderer with a mocked `window.lyra`, so UI can be screenshotted without Electron.
import { DEFAULT_SETTINGS, type PlaybackSnapshot, type Settings } from '@shared/types'
import { DEMO_TRACKS } from '@core/demo/data'
import { demoLyrics } from '@core/demo/lyrics'

const q = new URLSearchParams(location.search)
if (q.get('android')) document.documentElement.dataset.platform = 'android'
if (q.get('overlay')) document.documentElement.dataset.overlay = '1'
const idx = Number(q.get('track') ?? 0)
let track = DEMO_TRACKS[idx] ?? DEMO_TRACKS[0]!
const playbackListeners: Array<(s: PlaybackSnapshot) => void> = []
let settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, source: 'api', ...(JSON.parse(q.get('s') ?? '{}') as Partial<Settings>) }
const startedAt = Date.now() - Number(q.get('t') ?? 40000)
const playing = q.get('paused') !== '1'
const snap = (): PlaybackSnapshot => ({
  track, isPlaying: playing, positionMs: Date.now() - startedAt, sampledAt: Date.now(),
  device: { name: 'Studio PC', type: 'Computer', volume: 70 } as never, shuffle: false, repeat: 'off', isAdOrUnknown: false
})
const lyricsFor = (id: string): unknown => {
  const ly = q.get('ly')
  if (ly === 'offline') return { trackId: id, status: 'error', provider: 'lrclib', lines: [], error: { kind: 'network', message: 'offline', retryable: true } }
  if (ly === 'resting') return { trackId: id, status: 'error', provider: 'lrclib', lines: [], error: { kind: 'rate-limit', message: 'resting', retryable: true, retryInSec: 24 } }
  if (ly === 'error') return { trackId: id, status: 'error', provider: 'lrclib', lines: [], error: { kind: 'server', message: 'boom', retryable: true } }
  if (ly === 'none') return { trackId: id, status: 'none', provider: 'lrclib', lines: [] }
  if (ly === 'stale') return { ...demoLyrics(id), stale: true }
  return demoLyrics(id)
}
const sub = () => () => {}
const noop = async () => undefined
const api: any = {
  settings: { get: async () => settings, set: async (p: Partial<Settings>) => (settings = { ...settings, ...p }), reset: async () => settings, onChange: sub },
  window: { setMode: noop, getMode: async () => (q.get('mode') ?? 'mini'), onMode: sub, onFade: sub, settle() {}, resizeStart() {}, resizeMove() {}, resizeEnd() {}, dragStart() {}, dragMove() {}, dragEnd() {}, hide() {}, minimize() {}, quit() {} },
  spotify: { connect: noop, disconnect: noop, startDemo: noop, useLocal: noop, getStatus: async () => ({ state: 'demo' }), getSnapshot: async () => snap(), onStatus: sub, onPlayback: (cb: (s: PlaybackSnapshot) => void) => { playbackListeners.push(cb); return () => {} } },
  player: { command: async () => ({ ok: true }), isLiked: async () => false, setLiked: async () => ({ ok: true }), queue: async () => DEMO_TRACKS.slice(1).map((t) => ({ track: t })), recent: async () => [], openInSpotify: noop },
  // ?ly= simulates the lyrics outcome: offline | resting | error | none | stale
  lyrics: {
    get: async (t: { id: string }) => lyricsFor(t.id),
    refresh: async (t: { id: string }) => lyricsFor(t.id),
    importText: async (_t: unknown, text: string) => ({ trackId: track.id, status: 'plain', provider: 'you', lines: [], plain: text, imported: true, pinned: true }),
    importFile: async () => null,
    health: async () => [
      { id: 'lrclib', name: 'LRCLIB', state: q.get('ly') === 'resting' ? 'down' : q.get('ly') === 'offline' ? 'slow' : 'ok', lastError: '', retryInSec: q.get('ly') === 'resting' ? 24 : 0, lastOkAt: 0 },
      { id: 'public-domain', name: 'Public-domain library', state: 'ok', lastError: '', retryInSec: 0, lastOkAt: 0 }
    ], candidates: async () => ({ items: [] }), choose: async () => demoLyrics(track.id), clearPin: async () => demoLyrics(track.id) },
  art: { get: async (u: string) => u },
  moments: { list: async () => [], add: async () => [], remove: async () => [] },
  background: {
    // ?vs= simulates every video outcome: searching | nokey | none | error | live | preview
    resolve: () => {
      const vs = q.get('vs') ?? (q.get('video') ? 'live' : 'off')
      const base = { youtube: 'off', hasSongMedia: false, hasGlobalMedia: false }
      if (vs === 'searching') return new Promise(() => {})
      if (vs === 'live') return Promise.resolve({ ...base, spec: { kind: 'media', url: `/${q.get('video') ?? 'night'}.mp4`, media: 'video', name: 'Glass Hours (Official Video)', scope: 'song' } })
      if (vs === 'preview') return Promise.resolve({ ...base, spec: { kind: 'preview', url: '/day.mp4', title: 'Glass Hours preview', width: 1280 } })
      const youtube = vs === 'nokey' ? 'no-key' : vs === 'none' ? 'none' : vs === 'error' ? 'error' : 'off'
      return Promise.resolve({ ...base, youtube, youtubeMessage: 'HTTP 403', spec: { kind: 'living' } })
    },
    pick: async () => ({ ok: false }), clear: noop, hasYoutubeKey: async () => false, setYoutubeKey: async () => ({ ok: true }), clearYoutubeKey: noop, youtubeCandidates: async () => ({ items: [] }), karaokeVideos: async () => ({ items: [] }), youtubeChoose: noop },
  update: { get: async () => ({ state: 'idle' }), check: noop, install: noop, onState: sub },
  studio: {}, lan: { info: async () => ({ running: false, urls: [], qr: null }), onOffer: sub, answer: noop },
  app: { info: async () => ({ version: '0.17.1', platform: 'win32', envClientId: false }), diagnostics: async () => '', copy: async () => true, copyImage: async () => true, shareImage: async () => 'saved', failedShortcuts: async () => [], onCommand: sub }
}
;(window as any).lyra = api
// window.__next() plays the next demo song (used to check the vibe conductor)
;(window as any).__next = () => {
  track = DEMO_TRACKS[(DEMO_TRACKS.indexOf(track) + 1) % DEMO_TRACKS.length]!
  playbackListeners.forEach((cb) => cb({ ...snap(), positionMs: 1000, sampledAt: Date.now() }))
}
await import('@/main')
const panel = q.get('panel')
if (panel) { const { useUi } = await import('@/store/ui'); useUi.getState().setPanel(panel as never) }
