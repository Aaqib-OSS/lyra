export interface TokenRecord {
  accessToken: string
  refreshToken: string
  /** epoch ms */
  expiresAt: number
  clientId: string
}

/** Parse a decrypted token blob; null if it is not a complete record (never trust a file, even an encrypted one). */
export function parseTokenRecord(json: string): TokenRecord | null {
  try {
    const r = JSON.parse(json) as Partial<TokenRecord> | null
    if (!r || typeof r !== 'object') return null
    if (typeof r.accessToken !== 'string' || !r.accessToken) return null
    if (typeof r.refreshToken !== 'string' || !r.refreshToken) return null
    if (typeof r.clientId !== 'string' || !r.clientId) return null
    if (typeof r.expiresAt !== 'number' || !Number.isFinite(r.expiresAt)) return null
    return { accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt, clientId: r.clientId }
  } catch {
    return null
  }
}
