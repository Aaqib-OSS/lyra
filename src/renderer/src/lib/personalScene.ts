import type { LyricLine, PersonalScene, Track } from '@shared/types'

/**
 * Where the scene's video should be for a given song time. The video was cut for one part of the song, so `anchors` pair a song
 * second with the video second that shows it; between two anchors the video runs faster or slower to stay with the song.
 * Outside the part the video was cut for, the lively part of the video loops.
 */
export function videoTimeFor(songSec: number, scene: Pick<PersonalScene, 'anchors' | 'loopFrom' | 'loopTo'>): { v: number; slope: number } {
  const A = scene.anchors
  if (A.length < 2) return { v: 0, slope: 1 }
  const first = A[0]!
  const last = A[A.length - 1]!
  if (songSec >= first[0] && songSec <= last[0]) {
    let i = 0
    while (i < A.length - 2 && songSec > A[i + 1]![0]) i++
    const [s0, v0] = A[i]!
    const [s1, v1] = A[i + 1]!
    const k = s1 > s0 ? (v1 - v0) / (s1 - s0) : 1
    return { v: v0 + (songSec - s0) * k, slope: k }
  }
  const span = Math.max(1, scene.loopTo - scene.loopFrom)
  const ref = A[1]![0]
  const m = (((songSec - ref) % span) + span) % span
  return { v: scene.loopFrom + m, slope: 1 }
}

/** "(Baby, hold me close) Look me dead in my eyes": the bracketed part is a backing vocal, shown small above the line. */
export function splitLine(text: string): { bk: string; main: string } {
  const t = text.trim()
  const m = /^\((.*?)\)\s*(.*)$/.exec(t)
  return m && m[2] ? { bk: m[1]!.trim(), main: m[2].trim() } : { bk: '', main: t }
}

/** The part of a line, 0..1, that each word covers (by letters), for the highlighter that follows the singing. */
export function wordSpans(words: readonly string[]): Array<[number, number]> {
  const w = words.map((x) => x.replace(/[^\p{L}\p{N}]/gu, '').length + 1)
  const sum = w.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  return w.map((x) => {
    const a = acc / sum
    acc += x
    return [a, acc / sum] as [number, number]
  })
}

/** How long the current line lasts (ms): until the next one starts, with limits for the very short and the very long. */
export function lineDuration(lines: readonly LyricLine[], i: number): number {
  const l = lines[i]
  if (!l) return 0
  const next = lines[i + 1] ? lines[i + 1]!.timeMs : l.timeMs + 4500
  return Math.max(900, Math.min(next - l.timeMs - 150, 6000))
}

/** The scene whose song is this one (title equal, artist among the track's artists), ignoring case and brackets. */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function matchScene(list: readonly PersonalScene[], track: Track | null): PersonalScene | null {
  if (!track) return null
  const title = norm(track.title)
  return list.find((s) => norm(s.match.title) === title && track.artists.some((a) => norm(a).includes(norm(s.match.artist)))) ?? null
}
