// Pure helpers of the Windows updater (no Electron), so they can be unit tested.

const MIN = 60_000

/** Seconds-free, user-facing message for an updater failure. */
export function friendlyUpdateError(msg: string): string {
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|net::|network|socket hang up/i.test(msg)) return 'Couldn’t reach GitHub. Check your connection.'
  if (/rate limit|\b403\b/i.test(msg)) return 'GitHub is rate limiting update checks. Try again later.'
  if (/sha512|checksum|signature|integrity/i.test(msg)) return 'The downloaded update did not pass its safety check, so it was discarded. Lyra will try again.'
  if (/ENOSPC/i.test(msg)) return 'Not enough free disk space to download the update.'
  if (/EPERM|EACCES|EBUSY/i.test(msg)) return 'Windows blocked writing the update (an antivirus may be scanning it). Lyra will try again.'
  if (/404|Not Found|latest\.yml|Cannot find/i.test(msg)) return 'No update information was found yet.'
  return msg.replace(/\s+/g, ' ').slice(0, 160)
}

/** Errors that are worth retrying soon (the network or a busy disk); a missing release or a bad file is not. */
export function isTransient(msg: string): boolean {
  return /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|net::|network|socket hang up|EPERM|EBUSY|\b5\d\d\b/i.test(msg)
}

/** Delay before the next try after N failures in a row: 5 min, 15 min, 1 h, then back to the normal cadence. */
export function retryDelayMs(failures: number): number | null {
  const steps = [5 * MIN, 15 * MIN, 60 * MIN]
  return failures >= 1 && failures <= steps.length ? (steps[failures - 1] ?? null) : null
}

/**
 * electron-updater hands over the release body as HTML, a plain string, or an array of { version, note }.
 * The app shows plain text only, never markup: tags are dropped, entities decoded, length capped.
 */
export function releaseNotesToText(notes: unknown, max = 1200): string | undefined {
  let raw = ''
  if (typeof notes === 'string') raw = notes
  else if (Array.isArray(notes)) raw = notes.map((n) => (n && typeof n === 'object' && 'note' in n ? String((n as { note: unknown }).note ?? '') : '')).join('\n')
  if (!raw) return undefined
  const text = raw
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}
