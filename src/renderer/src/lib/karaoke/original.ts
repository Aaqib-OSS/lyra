import { useMemo } from 'react'
import type { Track } from '@shared/types'
import { getPosition, usePlayer } from '@/store/player'
import type { SingClock } from './player'

/**
 * The original song as the karaoke clock, for a lyrics-only sing-along when no karaoke version exists: the shared song
 * clock (core/clock.ts via the player store) drives the lyrics, so they follow Spotify / the media session exactly,
 * including pauses and seeks made elsewhere. Nothing is loaded and nothing re-renders per frame.
 */
export function useOriginalClock(track: Track | null, active: boolean): SingClock {
  const playing = usePlayer((s) => !!s.snapshot?.isPlaying)
  return useMemo<SingClock>(
    () => ({
      ready: active && !!track,
      playing,
      now: () => getPosition() / 1000,
      isPlaying: () => !!usePlayer.getState().snapshot?.isPlaying && !usePlayer.getState().snapshot?.isAdOrUnknown,
      length: () => (track?.durationMs ?? 0) / 1000,
      play: () => void usePlayer.getState().command({ type: 'play' }),
      pause: () => void usePlayer.getState().command({ type: 'pause' }),
      seek: (sec: number) => void usePlayer.getState().command({ type: 'seek', positionMs: Math.max(0, sec * 1000) })
    }),
    [track, active, playing]
  )
}
