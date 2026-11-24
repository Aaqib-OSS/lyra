import type { LyricLine, LyricWord } from './types'

const LINE_STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const WORD_STAMP = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i

function toMs(min: string, sec: string, frac?: string): number {
  const ms = frac ? parseInt(frac.padEnd(3, '0').slice(0, 3), 10) : 0
  return (parseInt(min, 10) * 60 + parseInt(sec, 10)) * 1000 + ms
}

function parseWords(body: string): LyricWord[] | undefined {
  const matches = [...body.matchAll(WORD_STAMP)]
  if (matches.length === 0) return undefined
  const words: LyricWord[] = []
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = matches[i + 1]?.index ?? body.length
    const text = body.slice(start, end)
    if (text.trim().length === 0) return // trailing end-marker
    words.push({ timeMs: toMs(m[1]!, m[2]!, m[3]), text })
  })
  return words.length > 0 ? words : undefined
}

/**
 * Parse LRC (and enhanced LRC with <mm:ss.xx> word stamps) into sorted lines.
 * Lines without any timestamp are ignored; callers fall back to plain text.
 */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  let offset = 0

  for (const raw of source.split(/\r?\n/)) {
    const row = raw.trim()
    if (!row) continue
    const off = OFFSET_TAG.exec(row)
    if (off) {
      offset = parseInt(off[1]!, 10)
      continue
    }
    const stamps = [...row.matchAll(LINE_STAMP)]
    if (stamps.length === 0) continue
    const last = stamps[stamps.length - 1]!
    const body = row.slice((last.index ?? 0) + last[0].length)
    const words = parseWords(body)
    const text = body.replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim()
    for (const s of stamps) {
      lines.push({ timeMs: Math.max(0, toMs(s[1]!, s[2]!, s[3]) + offset), text, ...(words ? { words } : {}) })
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

/** Index of the line active at `positionMs` (-1 before first line). Binary search. */
export function findActiveLine(lines: readonly LyricLine[], positionMs: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid]!.timeMs <= positionMs) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Strip any timestamps to get readable plain text. */
export function stripLrc(source: string): string {
  return source
    .split(/\r?\n/)
    .map((l) => l.replace(LINE_STAMP, '').replace(WORD_STAMP, '').trim())
    .filter((l, i, a) => !/^\[[a-z]+:.*\]$/i.test(l) && !(l === '' && a[i - 1] === ''))
    .join('\n')
    .trim()
}

const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

/** SubRip (.srt) subtitles as timed lyric lines (the end time keeps a long line from stretching over a gap). */
export function parseSrt(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  const ms = (h: string, m: string, s: string, f: string): number => ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(f.padEnd(3, '0'))
  for (const block of source.replace(/\r/g, '').split(/\n{2,}/)) {
    const rows = block.split('\n').filter((r) => r.trim() !== '')
    const at = rows.findIndex((r) => SRT_TIME.test(r))
    if (at < 0) continue
    const m = SRT_TIME.exec(rows[at]!)!
    const text = rows
      .slice(at + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) lines.push({ timeMs: ms(m[1]!, m[2]!, m[3]!, m[4]!), text, endMs: ms(m[5]!, m[6]!, m[7]!, m[8]!) })
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

export interface ImportedLyrics {
  kind: 'synced' | 'plain' | 'empty'
  lines: LyricLine[]
  plain: string
  format: 'lrc' | 'srt' | 'text'
}

/**
 * Understand whatever the user pasted or dropped: LRC / enhanced LRC, SRT subtitles, or plain words.
 * Never throws; unreadable input comes back as `empty`.
 */
export function parseImported(raw: string): ImportedLyrics {
  const text = raw.replace(/^﻿/, '').replace(/\u0000/g, '').slice(0, 400_000)
  if (!text.trim()) return { kind: 'empty', lines: [], plain: '', format: 'text' }
  if (SRT_TIME.test(text)) {
    const lines = parseSrt(text)
    if (lines.length) return { kind: 'synced', lines, plain: lines.map((l) => l.text).join('\n'), format: 'srt' }
  }
  const lrc = parseLrc(text)
  if (lrc.length >= 2) return { kind: 'synced', lines: lrc, plain: stripLrc(text), format: 'lrc' }
  const plain = stripLrc(text).trim()
  return plain ? { kind: 'plain', lines: [], plain, format: 'text' } : { kind: 'empty', lines: [], plain: '', format: 'text' }
}

/** The import calls answer with lyrics or `{ error }`; lyrics results may carry an `error` object too, so check its type. */
export const isImportError = (r: unknown): r is { error: string } => typeof (r as { error?: unknown } | null)?.error === 'string'

/**
 * Turn the bytes of a lyrics file into text. Handles the BOMs of UTF-8 / UTF-16 (Windows Notepad "Unicode" saves
 * UTF-16), and falls back to Windows-1252 when the bytes are not valid UTF-8 (old tools), so accents survive.
 */
export function decodeLyricsBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
