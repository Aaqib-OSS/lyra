/**
 * The karaoke score. Honest about what it can know: it hears WHEN you sing (voice against the lyric timing) and HOW
 * CLEANLY (how close each held note is to a note of the scale, steadiness), not whether it is the song's own melody:
 * a plain karaoke video carries no melody to compare with.
 *
 *   line points = coverage (share of the line you sang) x (0.6 + 0.4 x tuning)  -> 0..100
 *   streak: lines in a row at 60 or more points; every 3 in a row adds 10%
 */
export interface KLine {
  startMs: number
  endMs: number
  text: string
}

/** One microphone reading, taken about 20 times a second. */
export interface Frame {
  tMs: number
  /** the voice is clearly louder than the room (and than the backing track leaking in) */
  voiced: boolean
  /** distance from the nearest note in cents, only when a clear pitch was heard */
  cents: number | null
}

export interface LineResult {
  index: number
  text: string
  coverage: number // 0..1
  tuning: number // 0..1, 1 = every held note right on a note of the scale
  points: number // 0..100
  grade: 'perfect' | 'great' | 'ok' | 'miss'
}

export function grade(points: number): LineResult['grade'] {
  return points >= 85 ? 'perfect' : points >= 65 ? 'great' : points >= 35 ? 'ok' : 'miss'
}

/**
 * A singer hears the cue, then sings, and the sound takes a moment to reach the microphone and the analyser: voice
 * lands about this much after the lyric's own time. Frames are read this much earlier so a prompt singer is not scored
 * as late. (A constant: the real round trip of a given device cannot be measured without a loopback.)
 */
export const REACTION_MS = 150

/** an instrumental marker or an empty line is not sung: it must not count as a miss */
export function isScorable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

/** Turns the frames of one line into its result. */
export function scoreLine(index: number, line: KLine, frames: Frame[], latencyMs = REACTION_MS): LineResult {
  const inLine = frames.filter((f) => f.tMs - latencyMs >= line.startMs && f.tMs - latencyMs < line.endMs)
  const voiced = inLine.filter((f) => f.voiced)
  // a line is sung "fully" when you voice about 70% of it (breaths and consonants fill the rest)
  const coverage = inLine.length ? Math.min(1, voiced.length / (inLine.length * 0.7)) : 0
  const tuned = voiced.filter((f) => f.cents !== null)
  let tuning = 0.5 // no clear note heard (spoken, whispered, very short): neither reward nor punish much
  if (tuned.length >= 5) {
    // 0 cents off = 1, 50 cents (halfway between two notes) = 0
    tuning = tuned.reduce((a, f) => a + (1 - Math.min(50, Math.abs(f.cents!)) / 50), 0) / tuned.length
  }
  const points = Math.round(100 * coverage * (0.6 + 0.4 * tuning))
  return { index, text: line.text, coverage, tuning, points, grade: grade(points) }
}

export interface Summary {
  total: number // 0..10000
  stars: number // 0..5
  lines: LineResult[]
  bestStreak: number
  sungShare: number // share of lines at "ok" or better
  /** how much of the sung lines the voice covered, 0..1 (timing) */
  timing: number
  /** how steady the held notes were, 0..1 (only lines with clear notes) */
  steadiness: number
  /** lines per grade */
  grades: Record<LineResult['grade'], number>
  /** the microphone heard (almost) nothing: muted, wrong device, or not singing */
  silent: boolean
}

/**
 * Scores the lines that are over (or all, at the end). Skips lines that are not sung, and lines that start after the
 * microphone was lost (`lostAtMs`), so a cable pulled half way does not turn the rest of the song into misses.
 */
export function scoreLines(lines: KLine[], frames: Frame[], from = 0, to = lines.length, lostAtMs = Infinity): LineResult[] {
  const out: LineResult[] = []
  for (let i = from; i < to; i++) {
    const l = lines[i]!
    if (!isScorable(l.text) || l.startMs >= lostAtMs) continue
    out.push(scoreLine(i, l, frames))
  }
  return out
}

/** The whole performance. */
export function summarize(results: LineResult[], frames: Frame[] = []): Summary {
  let streak = 0
  let best = 0
  let total = 0
  for (const r of results) {
    if (r.points >= 60) streak++
    else streak = 0
    best = Math.max(best, streak)
    const multiplier = 1 + 0.1 * Math.floor(streak / 3)
    total += Math.round(r.points * multiplier)
  }
  const maxPoints = Math.max(1, results.length * 100)
  const ratio = Math.min(1, total / maxPoints)
  const stars = ratio >= 0.9 ? 5 : ratio >= 0.75 ? 4 : ratio >= 0.55 ? 3 : ratio >= 0.35 ? 2 : ratio >= 0.15 ? 1 : 0
  const sung = results.filter((r) => r.grade !== 'miss').length
  const grades = { perfect: 0, great: 0, ok: 0, miss: 0 }
  for (const r of results) grades[r.grade]++
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const heard = frames.filter((f) => f.voiced).length
  return {
    total: Math.round(ratio * 10000),
    stars,
    lines: results,
    bestStreak: best,
    sungShare: results.length ? sung / results.length : 0,
    timing: avg(results.map((r) => r.coverage)),
    steadiness: avg(results.filter((r) => r.tuning !== 0.5).map((r) => r.tuning)),
    grades,
    silent: frames.length > 40 && heard / frames.length < 0.02
  }
}
