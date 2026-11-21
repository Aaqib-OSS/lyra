/**
 * Turns the ranker's reason codes into short English phrases (the i18n keys; the caller runs them through t()).
 * Positive reasons first, problems after, at most `max` phrases so the hint stays one line.
 */

const VIDEO: Record<string, string> = {
  'own-channel': 'from the artist’s channel',
  official: 'titled official',
  'length-match': 'same length as the song',
  hd: 'HD',
  'length-off': 'different length',
  variant: 'looks like a cover, live or edit',
  short: 'a short clip',
  topic: 'still image (auto-generated channel)',
  'title-differs': 'title differs',
  'artist-missing': 'artist not found'
}
const VIDEO_ORDER = ['own-channel', 'official', 'length-match', 'hd', 'length-off', 'variant', 'short', 'topic', 'title-differs', 'artist-missing']

const LYRICS: Record<string, string> = {
  'right-song': 'same song',
  synced: 'synced to the music',
  'length-match': 'same length',
  plain: 'no timing (plain text)',
  instrumental: 'instrumental',
  'length-off': 'different length',
  'other-song': 'may be a different song'
}
const LYRICS_ORDER = ['right-song', 'synced', 'length-match', 'plain', 'instrumental', 'length-off', 'other-song']

function phrases(codes: readonly string[] | undefined, table: Record<string, string>, order: string[], max: number): string[] {
  if (!codes) return []
  return order.filter((c) => codes.includes(c)).slice(0, max).map((c) => table[c]!)
}

export const videoWhy = (codes: readonly string[] | undefined, max = 3): string[] => phrases(codes, VIDEO, VIDEO_ORDER, max)
export const lyricsWhy = (codes: readonly string[] | undefined, max = 3): string[] => phrases(codes, LYRICS, LYRICS_ORDER, max)
