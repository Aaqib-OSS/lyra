/**
 * LyraFeed: the one small shape every "viewer" surface (OBS overlay, browser / TV viewer, a future Cast receiver, a watch
 * tile) consumes, so none of them care how the music state reaches them. It is filled from Lyra Connect messages
 * (docs/connect-protocol.md): `now` -> nowPlaying, `play` + ping/pong clock offset -> positionClock, `lyrics`, `art`, `view`.
 *
 * The overlay page is a single self-contained HTML file, so its runtime copy of this contract lives in
 * `src/main/connect/overlayPage.ts` (`applyHost`, plain JS, unit-tested). Keep the two in step.
 */
export interface LyraFeedTrack {
  trackId: string
  title: string
  artists: string
  durationMs: number
  /** `https:` URL or inline `data:` image the viewer can load the cover from, or null */
  artUrl: string | null
}

export interface LyraFeedClock {
  /** playback position at `sampledAt` */
  positionMs: number
  /** the sender's (host's) Date.now() when `positionMs` was sampled */
  sampledAt: number
  playing: boolean
  /** host clock minus this device's clock (Connect clock offset), so the position can be extrapolated locally */
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
  /** the host's lyric timing shift in effect (global + per-song), ms; lyric time = position - this */
  lyricOffsetMs?: number
}
