/**
 * LyraFeed: the one small shape every "viewer" surface (OBS overlay, browser / TV viewer, a future Cast receiver, a watch tile)
 * consumes, so none of them care how the music state reaches them. Today the feed is filled from the LAN viewer server
 * (`/events` + `/lyrics` + `/art`); the connection protocol being written separately can supply the same shape later.
 *
 * The overlay page is a single self-contained HTML file, so its runtime copy of this contract lives in
 * `src/main/lan/overlayPage.ts` (plain JS, unit-tested). Keep the two in step.
 */
export interface LyraFeedTrack {
  trackId: string
  title: string
  artists: string
  durationMs: number
  /** URL the viewer can load the cover from, or null */
  artUrl: string | null
}

export interface LyraFeedClock {
  /** playback position at `sampledAt` */
  positionMs: number
  /** the sender's Date.now() when `positionMs` was sampled */
  sampledAt: number
  playing: boolean
  /** sender clock minus this device's clock, so the position can be extrapolated locally */
  skewMs: number
}

export interface LyraFeedLine {
  timeMs: number
  text: string
}

export type LyraFeedLyricsStatus = 'none' | 'loading' | 'synced' | 'instrumental' | 'error'

export interface LyraFeed {
  nowPlaying: LyraFeedTrack | null
  positionClock: LyraFeedClock
  lyrics: { status: LyraFeedLyricsStatus; lines: LyraFeedLine[] }
  /** the vibe id the sender is showing (a `Vibe` from types.ts), or null when unknown */
  vibe: string | null
  /** a reference to the video behind the lyrics (a URL or a search key); null when there is none */
  videoRef: string | null
}

/** What `GET /events` sends (one JSON object per SSE message). */
export interface LanStateMessage {
  type: 'state'
  now: number
  trackId: string
  title: string
  artists: string
  durationMs: number
  hasArt: boolean
  playing: boolean
  positionMs: number
  sampledAt: number
  /** the vibe chosen in the app (added so overlays can follow the app's look) */
  vibe?: string
}
