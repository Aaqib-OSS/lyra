import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../logger'

const log = createLogger('tokens')

import { parseTokenRecord, type TokenRecord } from './tokenRecord'

export type { TokenRecord }

/**
 * Persists tokens encrypted with the OS credential store (Windows DPAPI via safeStorage).
 * If encryption is unavailable we keep tokens in memory only — never plaintext on disk.
 */
export class TokenStore {
  private memory: TokenRecord | null = null
  private get file(): string {
    return join(app.getPath('userData'), 'spotify-auth.bin')
  }

  load(): TokenRecord | null {
    if (this.memory) return this.memory
    try {
      if (!existsSync(this.file) || !safeStorage.isEncryptionAvailable()) return null
      const rec = parseTokenRecord(safeStorage.decryptString(readFileSync(this.file)))
      if (!rec) throw new Error('stored token record is malformed')
      this.memory = rec
      return this.memory
    } catch (e) {
      log.warn('stored tokens unreadable; ignoring', e)
      this.clear()
      return null
    }
  }

  save(rec: TokenRecord): void {
    this.memory = rec
    try {
      if (safeStorage.isEncryptionAvailable()) {
        // write-then-rename: a crash mid-write must never leave a truncated token file
        const tmp = `${this.file}.tmp`
        writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(rec)))
        renameSync(tmp, this.file)
      } else log.warn('OS encryption unavailable; session tokens kept in memory only')
    } catch (e) {
      log.error('could not persist tokens', e)
    }
  }

  clear(): void {
    this.memory = null
    try {
      rmSync(this.file, { force: true })
    } catch {
      /* already gone */
    }
  }
}
