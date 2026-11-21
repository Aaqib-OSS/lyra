/**
 * The optional "start gate" (docs/engine-plan.md section 3): when a song has just started and neither its lyrics nor its
 * video are ready, the player may be held for a very short moment so nothing is missed. OFF by default; a pure decision
 * function so every rule is tested without a player.
 *
 * Rules, all of which must hold:
 *  - the switch is on and the player can pause / resume (Windows + Spotify; the phone is not supported yet)
 *  - the song JUST started (we are in its first seconds) and the user did not seek or pause it
 *  - lyrics are still loading AND the video (when one is wanted) is still loading: if either is ready the song is fine
 *  - the first lyric line is known to be more than 5 s into the song (otherwise a hold would make us miss it), and the
 *    hold fits before it
 * The hold is never longer than 1.5 s.
 */
export const MAX_HOLD_MS = 1500
/** the first line must be at least this far into the song for a hold to be worth it */
export const MIN_FIRST_LINE_MS = 5000
/** we only gate a song in its first moments */
export const JUST_STARTED_MS = 2500

export interface GateInput {
  enabled: boolean
  /** can this player be paused and resumed by Lyra at all */
  canControl: boolean
  isPlaying: boolean
  /** where the song is now */
  positionMs: number
  /** the user jumped within this song, or already paused it: never gate then */
  userTouched: boolean
  /** this song was already gated once */
  alreadyGated: boolean
  lyricsLoading: boolean
  /** a video is wanted for this song (video style on, not reduced motion) */
  videoWanted: boolean
  videoLoading: boolean
  /** time of the first lyric line, if known (remembered from an earlier play), else null */
  firstLineMs: number | null
}

export type GateDecision = { hold: false; why: string } | { hold: true; holdMs: number; why: string }

const no = (why: string): GateDecision => ({ hold: false, why })

export function decideStartGate(i: GateInput): GateDecision {
  if (!i.enabled) return no('off')
  if (!i.canControl) return no('this player cannot be paused by Lyra')
  if (!i.isPlaying) return no('not playing')
  if (i.userTouched) return no('the user paused or sought')
  if (i.alreadyGated) return no('already gated this song')
  if (i.positionMs > JUST_STARTED_MS) return no('the song did not just start')
  if (!i.lyricsLoading) return no('lyrics are ready')
  if (i.videoWanted && !i.videoLoading) return no('the video is ready')
  if (i.firstLineMs === null) return no('first lyric line unknown')
  if (i.firstLineMs < MIN_FIRST_LINE_MS) return no('the first line comes too early')
  // never hold into the first line: leave a margin of one second
  const room = i.firstLineMs - i.positionMs - 1000
  const holdMs = Math.min(MAX_HOLD_MS, Math.floor(room))
  if (holdMs < 300) return no('no room before the first line')
  return { hold: true, holdMs, why: 'lyrics' + (i.videoWanted ? ' and video' : '') + ' still loading' }
}
