// Browser harness: runs the real renderer with a mocked `window.lyra`, so UI can be screenshotted without Electron.
import { DEFAULT_SETTINGS, type PlaybackSnapshot, type Settings } from '@shared/types'
import { DEMO_TRACKS } from '@core/demo/data'
import { demoLyrics } from '@core/demo/lyrics'

const q = new URLSearchParams(location.search)
const idx = Number(q.get('track') ?? 0)
const track = DEMO_TRACKS[idx] ?? DEMO_TRACKS[0]
let settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, source: 'api', ...(JSON.parse(q.get('s') ?? '{}') as Partial<Settings>) }
const startedAt = Date.now() - Number(q.get('t') ?? 40000)
const playing = q.get('paused') !== '1'
const snap = (): PlaybackSnapshot => ({
  track, isPlaying: playing, positionMs: Date.now() - startedAt, sampledAt: Date.now(),
  device: { name: 'Studio PC', type: 'Computer', volume: 70 } as never, shuffle: false, repeat: 'off', isAdOrUnknown: false
})
const sub = () => () => {}
const noop = async () => undefined
const api: any = {
  settings: { get: async () => settings, set: async (p: Partial<Settings>) => (settings = { ...settings, ...p }), reset: async () => settings, onChange: sub },
  window: { setMode: noop, getMode: async () => (q.get('mode') ?? 'mini'), onMode: sub, onFade: sub, settle() {}, resizeStart() {}, resizeMove() {}, resizeEnd() {}, dragStart() {}, dragMove() {}, dragEnd() {}, hide() {}, minimize() {}, quit() {} },
  spotify: { connect: noop, disconnect: noop, startDemo: noop, useLocal: noop, getStatus: async () => ({ state: 'demo' }), getSnapshot: async () => snap(), onStatus: sub, onPlayback: sub },
  player: { command: async () => ({ ok: true }), isLiked: async () => false, setLiked: async () => ({ ok: true }), queue: async () => DEMO_TRACKS.slice(1).map((t) => ({ track: t })), recent: async () => [], openInSpotify: noop },
  lyrics: { get: async () => demoLyrics(track.id), refresh: async () => demoLyrics(track.id), candidates: async () => ({ items: [] }), choose: async () => demoLyrics(track.id), clearPin: async () => demoLyrics(track.id) },
  art: { get: async (u: string) => u },
  moments: { list: async () => [], add: async () => [], remove: async () => [] },
  background: { resolve: async () => ({ spec: { kind: 'none' }, youtube: 'off', hasSongMedia: false, hasGlobalMedia: false }), pick: async () => ({ ok: false }), clear: noop, hasYoutubeKey: async () => false, setYoutubeKey: async () => ({ ok: true }), clearYoutubeKey: noop, youtubeCandidates: async () => ({ items: [] }), karaokeVideos: async () => ({ items: [] }), youtubeChoose: noop },
  update: { get: async () => ({ state: 'idle' }), check: noop, install: noop, onState: sub },
  studio: {}, lan: { info: async () => ({ running: false, urls: [], qr: null }), onOffer: sub, answer: noop },
  app: { info: async () => ({ version: '0.17.1', platform: 'win32', envClientId: false }), diagnostics: async () => '', copy: async () => true, copyImage: async () => true, shareImage: async () => 'saved', failedShortcuts: async () => [], onCommand: sub }
}
;(window as any).lyra = api
await import('@/main')
const panel = q.get('panel')
if (panel) { const { useUi } = await import('@/store/ui'); useUi.getState().setPanel(panel as never) }
