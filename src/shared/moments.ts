import type { SavedMoment } from './types'

/** Pure rules for the saved-moments collection, shared by Electron (main) and the Android shell. */
export const MOMENTS_MAX = 500
export const MOMENT_TEXT_MAX = 600
const FIELD_MAX = 200

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const key = (m: Pick<SavedMoment, 'trackId' | 'text'>): string => `${m.trackId}\u0000${m.text.toLowerCase()}`

/** One stored entry made safe: wrong types are dropped, text is single-spaced and capped. Null when unusable. */
export function sanitizeMoment(raw: unknown): SavedMoment | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const text = clip(r.text, MOMENT_TEXT_MAX)
  const trackId = clip(r.trackId, FIELD_MAX)
  if (!text || !trackId) return null
  const art = typeof r.artworkUrl === 'string' && /^(https?:|data:image\/|file:)/.test(r.artworkUrl) ? r.artworkUrl.slice(0, 2000) : null
  return {
    id: clip(r.id, 64) || `m-${Math.random().toString(36).slice(2)}`,
    trackId,
    title: clip(r.title, FIELD_MAX),
    artist: clip(r.artist, FIELD_MAX),
    artworkUrl: art,
    text,
    timeMs: Number.isFinite(r.timeMs) ? Math.max(0, Math.round(r.timeMs as number)) : 0,
    savedAt: Number.isFinite(r.savedAt) ? (r.savedAt as number) : 0
  }
}

/** Everything read from disk goes through here: junk entries and duplicates are dropped, the cap enforced. */
export function normalizeMoments(raw: unknown): SavedMoment[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SavedMoment[] = []
  for (const r of raw) {
    const m = sanitizeMoment(r)
    if (!m || seen.has(key(m))) continue
    seen.add(key(m))
    out.push(m)
    if (out.length >= MOMENTS_MAX) break
  }
  return out
}

/** Newest first; the same line of the same song (any capitalisation or spacing) is kept once. */
export function addMoment(items: SavedMoment[], input: Omit<SavedMoment, 'id' | 'savedAt'>, id: string, now: number): SavedMoment[] {
  const m = sanitizeMoment({ ...input, id, savedAt: now })
  if (!m || items.some((x) => key(x) === key(m))) return items
  return [m, ...items].slice(0, MOMENTS_MAX)
}

/** Case- and accent-insensitive match on the line, title and artist. Every word typed must appear somewhere. */
export function searchMoments(items: SavedMoment[], query: string): SavedMoment[] {
  const norm = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter((m) => {
    const hay = norm(`${m.text} ${m.title} ${m.artist}`)
    return words.every((w) => hay.includes(w))
  })
}

/** "Line" - Title, Artist: a caption that carries no link and nothing private. */
export function momentCaption(text: string, title: string, artist: string): string {
  const by = [title, artist].filter(Boolean).join(', ')
  return by ? `“${text}” — ${by}` : `“${text}”`
}

/** Markdown: grouped by song, so the file reads like a small anthology. */
export function momentsToMarkdown(items: SavedMoment[]): string {
  const groups = new Map<string, SavedMoment[]>()
  for (const m of items) {
    const k = `${m.title}\u0000${m.artist}`
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  const out = ['# My lyric moments', '']
  for (const g of groups.values()) {
    out.push(`## ${g[0]!.title || 'Unknown song'}${g[0]!.artist ? ` — ${g[0]!.artist}` : ''}`, '')
    for (const m of g) out.push(`> ${m.text}`, '')
  }
  return out.join('\n').trimEnd() + '\n'
}

export function momentsToText(items: SavedMoment[]): string {
  return items.map((m) => momentCaption(m.text, m.title, m.artist)).join('\n')
}
