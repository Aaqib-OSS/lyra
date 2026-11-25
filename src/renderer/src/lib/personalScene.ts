import type { PersonalScene, Track } from '@shared/types'

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The scene whose song is this one (title equal, artist among the track's artists), ignoring case and brackets. */
export function matchScene(list: readonly PersonalScene[], track: Track | null): PersonalScene | null {
  if (!track) return null
  const title = norm(track.title)
  return list.find((s) => norm(s.match.title) === title && track.artists.some((a) => norm(a).includes(norm(s.match.artist)))) ?? null
}
