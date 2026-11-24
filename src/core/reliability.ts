/**
 * Pure helpers behind logging, crash recovery and startup resilience (no Electron, no fs), so they can be unit-tested.
 * Nothing here sends anything anywhere: diagnostics only leave the PC if the user pastes them.
 */

/** Remove tokens, keys, e-mail addresses, the OS user name in paths and LAN addresses from free text. */
export function scrubText(text: string, home?: string): string {
  let t = text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/((?:access|refresh|id)_token["':=\s]+)[A-Za-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/((?:client_secret|api[_-]?key|apikey|secret|password|token|key|code_verifier)["':=\s]+)[A-Za-z0-9._~+/-]{8,}/gi, '$1[redacted]')
    .replace(/([?&#](?:code|state|code_verifier|token|key|access_token|refresh_token|pair|room)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{30,}/g, '[redacted-key]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\b(?!127\.0\.0\.1\b)(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b/g, '[lan-ip]')
  // /Users/name, C:\Users\name, /home/name -> keep the shape, drop the name
  t = t.replace(/([A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)[^\\/\s"']+/gi, '$1<user>')
  if (home && home.length > 3) t = t.split(home).join('<home>')
  return t
}

/** Renames to run (in this order) to shift `base`, `base.1`, `base.2`... by one and drop the oldest. */
export function rotationMoves(base: string, keep = 3): Array<{ from: string; to: string }> {
  const name = (i: number): string => {
    if (i === 0) return base
    const dot = base.lastIndexOf('.')
    return dot > 0 ? `${base.slice(0, dot)}.${i}${base.slice(dot)}` : `${base}.${i}`
  }
  const moves: Array<{ from: string; to: string }> = []
  for (let i = keep - 1; i >= 0; i--) moves.push({ from: name(i), to: name(i + 1) })
  return moves // the last file (name(keep)) is overwritten by the move into it
}

export const shouldRotate = (size: number, maxBytes: number): boolean => size >= maxBytes

export type StoreSource = 'primary' | 'backup' | 'defaults'

/** Decide which text of a JSON store to trust: the file, else its backup, else the defaults. */
export function chooseStoreSource(
  primary: string | null,
  backup: string | null,
  valid: (value: unknown) => boolean = (v) => v !== null && typeof v === 'object'
): { source: StoreSource; value: unknown; primaryCorrupt: boolean } {
  const parse = (raw: string | null): { ok: boolean; value?: unknown } => {
    if (raw === null) return { ok: false }
    try {
      const v = JSON.parse(raw.replace(/^﻿/, ''))
      return valid(v) ? { ok: true, value: v } : { ok: false }
    } catch {
      return { ok: false }
    }
  }
  const p = parse(primary)
  if (p.ok) return { source: 'primary', value: p.value, primaryCorrupt: false }
  const b = parse(backup)
  const primaryCorrupt = primary !== null // exists but unusable
  if (b.ok) return { source: 'backup', value: b.value, primaryCorrupt }
  return { source: 'defaults', value: undefined, primaryCorrupt }
}

export type Migrations = Record<number, (data: Record<string, unknown>) => Record<string, unknown>>

/**
 * Upgrade stored data from `from` to `to` by running migrations[from], migrations[from+1]... A missing step is
 * skipped; a throwing step stops the chain and reports the version reached so nothing half-migrated is stamped newer.
 */
export function migrate(data: Record<string, unknown>, from: number, to: number, migrations: Migrations): { data: Record<string, unknown>; version: number; failed: boolean } {
  let cur = data
  let v = from
  while (v < to) {
    const step = migrations[v]
    if (step) {
      try {
        cur = step(cur)
      } catch {
        return { data: cur, version: v, failed: true }
      }
    }
    v++
  }
  return { data: cur, version: v, failed: false }
}

export interface StartupMarker {
  /** consecutive starts that never reached "healthy" */
  crashes: number
  /** true once the last start stayed healthy */
  ok: boolean
}

export const SAFE_MODE_AFTER = 2

/** State to store at launch, given what the previous launch left behind. */
export function nextCrashState(prev: Partial<StartupMarker> | null): StartupMarker {
  if (!prev || typeof prev !== 'object') return { crashes: 0, ok: false }
  const crashes = prev.ok === false ? Math.min(99, (Number(prev.crashes) || 0) + 1) : 0
  return { crashes, ok: false }
}

/** Safe mode when the last `SAFE_MODE_AFTER` starts did not finish, or when forced (`--safe-mode`). */
export function decideSafeMode(state: StartupMarker, forced = false): boolean {
  return forced || state.crashes >= SAFE_MODE_AFTER
}

/** Loop guard for automatic window reloads: at most `max` in `windowMs`. */
export function canAutoReload(history: number[], now: number, max = 3, windowMs = 60_000): boolean {
  return history.filter((t) => now - t < windowMs).length < max
}

/** Friendly one-line text per kind of renderer failure. */
export function crashNotice(reason: string): string {
  if (reason === 'oom') return 'Lyra ran out of memory and reloaded its window. Close other heavy apps or turn off the animated background if it repeats.'
  if (reason === 'unresponsive') return 'Lyra’s window stopped responding and was reloaded. If this repeats, copy diagnostics from Settings → About.'
  return 'Lyra’s window crashed and was reloaded. Your settings are safe. If this repeats, copy diagnostics from Settings → About.'
}
