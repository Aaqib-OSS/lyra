import { useEffect } from 'react'
import type { QueueItem, Track } from '@shared/types'
import { karaokeInUse } from '@/lib/karaoke/memory'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'

/**
 * Smooth start: while a song plays, look at what is next in the queue and warm everything that song will need:
 * its lyrics (cached by the lyrics service), its background video candidates and the Apple clip (saved to disk by the
 * background service). When the song really starts, there is nothing left to wait for. Runs once per song, a few
 * seconds in (so it never competes with the current song's own lookups), only while playing, never on a metered or
 * saving-data connection, and only for the first item of the queue.
 */
export function usePrefetchNext(): void {
  const id = usePlayer((s) => s.snapshot?.track?.id ?? null)
  const playing = usePlayer((s) => s.snapshot?.isPlaying ?? false)
  const style = useSettings((s) => s.settings.backgroundStyle)

  useEffect(() => {
    if (!id || !playing) return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; metered?: boolean } }).connection
    if (conn?.saveData) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const queue = await window.lyra.player.queue()
        const next: QueueItem | undefined = queue?.[0]
        if (cancelled || !next || next.id === id) return
        // what the services need to find the song; the real duration arrives when it starts
        const guess: Track = { id: next.id, uri: '', title: next.title, artists: next.artists, album: '', releaseYear: null, durationMs: 0, artworkUrl: next.artworkUrl, explicit: false, webUrl: null }
        await window.lyra.lyrics.get(guess).catch(() => undefined)
        // karaoke: only for people who use it (a search costs YouTube quota); the answer is cached on disk
        if (!cancelled && karaokeInUse()) await window.lyra.background.karaokeVideos(guess).catch(() => undefined)
        if (cancelled || style === 'still' || style === 'living') return
        await window.lyra.background.resolve(guess).catch(() => undefined)
      } catch {
        /* prefetching is a nicety: any failure just means the song loads the normal way */
      }
    }, 6000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id, playing, style])
}
