import { cleanTitle } from './lyrics/match'

/**
 * A stable identity for a SONG (not a release or a player's track id): "artist|title" with the noise that differs
 * between sources removed (feat., remaster, live, brackets, case, accents, punctuation). Your choices for a song
 * (the lyrics you picked, the video you chose, the vibe you liked) are remembered under this key, so they survive
 * switching between Spotify and Windows media controls and re-releases of the same song.
 */
export function songKey(artist: string, title: string): string {
  const fold = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const first = artist.split(/\s*(?:,|;|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\band\b)\s*/i)[0] ?? artist
  return `${fold(first)}|${fold(cleanTitle(title).replace(/\s*[([][^)\]]*[)\]]/g, ''))}`
}

export const trackKey = (t: { artists: string[]; title: string }): string => songKey(t.artists[0] ?? '', t.title)
