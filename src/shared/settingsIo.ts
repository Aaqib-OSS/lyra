import { DEFAULT_SETTINGS, type Settings } from './types'

/**
 * Settings that never leave this device in an export (and are never read back from an import):
 * an account id, where the window sits, and what you listened to / picked per song.
 */
export const EXPORT_EXCLUDED: ReadonlyArray<keyof Settings> = ['spotifyClientId', 'position', 'miniSize', 'songVibes', 'customBackground', 'onboarded']

/** biggest import text we even try to read (a real export is about 2 KB) */
export const MAX_IMPORT_BYTES = 64 * 1024

const MARKER = 'lyra-settings'

/** The settings worth carrying to another PC, as text the user can copy and keep. */
export function exportSettings(s: Settings): string {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) if (!EXPORT_EXCLUDED.includes(k)) out[k] = s[k]
  return JSON.stringify({ app: MARKER, version: 1, settings: out }, null, 2)
}

const sameKind = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(b)) return Array.isArray(a)
  if (b === null) return a === null || typeof a === 'object'
  if (typeof b === 'object') return !!a && typeof a === 'object' && !Array.isArray(a)
  return typeof a === typeof b
}

export type ImportResult = { ok: true; patch: Partial<Settings>; count: number } | { ok: false; error: string }

/** Read text produced by exportSettings (or a bare settings object). Only known, importable keys of the right kind are kept; the main process still validates every value. */
export function parseSettingsImport(text: string): ImportResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Paste the settings text first.' }
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'That text is too long to be Lyra settings.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That does not look like Lyra settings. Copy them again from Settings → About.' }
  }
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { app?: unknown }).app === MARKER ? (raw as { settings?: unknown }).settings : raw
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'That does not look like Lyra settings.' }
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!(k in DEFAULT_SETTINGS) || EXPORT_EXCLUDED.includes(k as keyof Settings)) continue
    if (sameKind(v, (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k])) patch[k] = v
  }
  const count = Object.keys(patch).length
  return count ? { ok: true, patch: patch as Partial<Settings>, count } : { ok: false, error: 'No Lyra settings found in that text.' }
}

/** Settings the page lets you change, by name, so "what changed" can say it in plain words. `tab` is the Settings section that holds it. */
export const SETTING_LABELS: Partial<Record<keyof Settings, { label: string; tab: string }>> = {
  vibe: { label: 'Vibe', tab: 'look' },
  vibeMode: { label: 'Vibe changes', tab: 'look' },
  vibePool: { label: 'Vibes used when changing', tab: 'look' },
  theme: { label: 'Artwork colours', tab: 'look' },
  reducedMotion: { label: 'Reduce motion', tab: 'look' },
  smoothSongChange: { label: 'Song change effects', tab: 'look' },
  volumeFade: { label: 'Fade volume between songs', tab: 'look' },
  performance: { label: 'Effects', tab: 'look' },
  romanizeLyrics: { label: 'Roman letters', tab: 'lyrics' },
  wordByWord: { label: 'Highlight each word', tab: 'lyrics' },
  lyricOffsetMs: { label: 'Default sync offset', tab: 'lyrics' },
  backgroundStyle: { label: 'Video behind the lyrics', tab: 'lyrics' },
  backgroundDim: { label: 'Darken the video', tab: 'lyrics' },
  autoDim: { label: 'Auto dim', tab: 'lyrics' },
  startGate: { label: 'Wait a moment for lyrics', tab: 'lyrics' },
  backgroundInMini: { label: 'Video in the expanded player', tab: 'lyrics' },
  defaultMode: { label: 'Resting size', tab: 'general' },
  alwaysOnTop: { label: 'Stay on top of other windows', tab: 'general' },
  hideOnScreenShare: { label: 'Hide while screen sharing', tab: 'general' },
  opacity: { label: 'See-through', tab: 'general' },
  autoHide: { label: 'Fade when idle', tab: 'general' },
  launchAtStartup: { label: 'Launch at startup', tab: 'general' },
  trackNotifications: { label: 'Track change notifications', tab: 'general' },
  globalShortcuts: { label: 'Global shortcuts', tab: 'general' },
  shortcuts: { label: 'Your own global shortcuts', tab: 'general' },
  systemVolume: { label: 'Control system volume', tab: 'general' },
  connectEnabled: { label: 'Devices', tab: 'share' },
  keepScreenOn: { label: 'Keep screen on while playing', tab: 'phone' },
  keepRunning: { label: 'Keep Lyra running', tab: 'phone' },
  ambientStyle: { label: 'Ambient style', tab: 'phone' },
  ambientBrightness: { label: 'Ambient brightness', tab: 'phone' },
  ambientAutoBrightness: { label: 'Auto brightness', tab: 'phone' },
  ambientTrigger: { label: 'Open ambient on charge', tab: 'phone' },
  ambientClock: { label: 'Ambient clock', tab: 'phone' },
  ambientPixelShift: { label: 'Pixel shift', tab: 'phone' },
  ambientCardWhenOff: { label: 'Lock-screen card while screen off', tab: 'phone' }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export interface ChangedSetting {
  key: keyof Settings
  label: string
  tab: string
  /** short text of the current value */
  value: string
}

const PERCENT: ReadonlyArray<keyof Settings> = ['opacity', 'backgroundDim', 'ambientBrightness']

const show = (k: keyof Settings, v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  if (typeof v === 'number' && PERCENT.includes(k)) return `${Math.round(v * 100)}%`
  if (k === 'lyricOffsetMs' && typeof v === 'number') return `${v > 0 ? '+' : ''}${(v / 1000).toFixed(2)}s`
  if (typeof v === 'string' && v) return v.charAt(0).toUpperCase() + v.slice(1)
  if (Array.isArray(v)) return `${v.length} chosen`
  if (v && typeof v === 'object') return `${Object.keys(v).length} set`
  return String(v)
}

/** The settings that differ from the defaults, only those with a name on the page. */
export function changedFromDefault(s: Settings): ChangedSetting[] {
  const out: ChangedSetting[] = []
  for (const k of Object.keys(SETTING_LABELS) as Array<keyof Settings>) {
    if (!same(s[k], DEFAULT_SETTINGS[k])) out.push({ key: k, ...SETTING_LABELS[k]!, value: show(k, s[k]) })
  }
  return out
}
