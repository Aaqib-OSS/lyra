import type { ChoicesInfo, HostMsg, LyricLine, NowInfo, PlayInfo, ViewInfo } from './protocol'

/**
 * What the host currently shows, and which messages to send when it changes.
 * Every setter returns the message to broadcast, or null when nothing a client could see has changed (so an idle
 * host sends nothing, which is what keeps CPU and battery low). `snapshot()` is what a client gets on joining.
 */
/** a position that differs from the one the anchor predicts by more than this is a seek / jump, worth re-sending */
export const SEEK_JUMP_MS = 400
/** anchors older than this are re-sent anyway so a client that missed one still converges */
export const ANCHOR_REFRESH_MS = 10_000
/** artwork bigger than this is not sent over the wire */
export const MAX_ART_CHARS = 300_000

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export class SyncState {
  private now: NowInfo | null = null
  private choices: ChoicesInfo = {}
  private play: PlayInfo | null = null
  private view: ViewInfo | null = null
  private lyrics: { id: string; status: string; synced: boolean; lines: LyricLine[] } | null = null
  private art: { id: string; src: string | null } | null = null
  private lastAnchorSent = 0

  setNow(now: NowInfo | null, choices: ChoicesInfo = {}): HostMsg | null {
    if (same(now, this.now) && same(choices, this.choices)) return null
    const changedSong = this.now?.id !== now?.id
    this.now = now
    this.choices = choices
    if (changedSong) {
      this.lyrics = null
      this.art = null
    }
    return { t: 'now', now, ...(Object.keys(choices).length ? { choices } : {}) }
  }

  setPlay(p: PlayInfo, wallNow: number = Date.now()): HostMsg | null {
    const prev = this.play
    this.play = p
    if (prev) {
      const predicted = prev.positionMs + (prev.playing ? Math.max(0, p.at - prev.at) : 0)
      const jumped = Math.abs(predicted - p.positionMs) > SEEK_JUMP_MS
      if (prev.playing === p.playing && prev.volume === p.volume && !jumped && wallNow - this.lastAnchorSent < ANCHOR_REFRESH_MS) {
        // keep the OLD anchor: it still predicts the position, so there is nothing new to say
        this.play = prev
        return null
      }
    }
    this.lastAnchorSent = wallNow
    return { t: 'play', play: p }
  }

  setView(v: ViewInfo): HostMsg | null {
    if (same(v, this.view)) return null
    this.view = v
    return { t: 'view', view: v }
  }

  setLyrics(l: { id: string; status: string; synced: boolean; lines: LyricLine[] }): HostMsg | null {
    if (l.id !== this.now?.id) return null // a late answer for a song that is already over
    if (same(l, this.lyrics)) return null
    this.lyrics = l
    return { t: 'lyrics', ...l }
  }

  setArt(id: string, src: string | null): HostMsg | null {
    if (id !== this.now?.id) return null
    const ok = src && src.length <= MAX_ART_CHARS && (/^https:\/\//.test(src) || /^data:image\/(png|jpe?g|webp);base64,/.test(src)) ? src : null
    if (this.art?.id === id && this.art.src === ok) return null
    this.art = { id, src: ok }
    return { t: 'art', id, src: ok }
  }

  /** A periodic nudge: re-announce the anchor if it has been quiet for a while. */
  refresh(wallNow: number = Date.now()): HostMsg | null {
    if (!this.play || wallNow - this.lastAnchorSent < ANCHOR_REFRESH_MS) return null
    this.lastAnchorSent = wallNow
    return { t: 'play', play: this.play }
  }

  get songId(): string | null {
    return this.now?.id ?? null
  }

  snapshot(): HostMsg[] {
    const out: HostMsg[] = [{ t: 'now', now: this.now, ...(Object.keys(this.choices).length ? { choices: this.choices } : {}) }]
    if (this.view) out.push({ t: 'view', view: this.view })
    if (this.art) out.push({ t: 'art', ...this.art })
    if (this.lyrics) out.push({ t: 'lyrics', ...this.lyrics })
    if (this.play) out.push({ t: 'play', play: this.play })
    return out
  }
}
