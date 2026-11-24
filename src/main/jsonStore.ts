import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chooseStoreSource, migrate, type Migrations } from '../core/reliability'
import { createLogger } from './logger'

const log = createLogger('store')

export interface StoreOptions {
  /**
   * keep a `.bak` of the last good file and restore from it. Opt-in: stores that hold things a user can delete (history,
   * moments, picks) must not keep an older copy around. Without it a broken file is only set aside as `.corrupt`.
   */
  backup?: boolean
  /** current schema version; stored as `__v` in the file. Omit for unversioned stores. */
  version?: number
  /** migrations[n] upgrades data from version n to n+1 */
  migrations?: Migrations
}

const read = (p: string): string | null => {
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}

/** Tiny atomic, debounced JSON file store living in userData. */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  readonly path: string

  private readonly opts: StoreOptions

  constructor(name: string, private readonly defaults: T, opts: StoreOptions | boolean = {}) {
    this.opts = typeof opts === 'boolean' ? { backup: opts } : opts
    this.path = join(app.getPath('userData'), name)
    this.data = this.load()
  }

  private load(): T {
    const r = chooseStoreSource(read(this.path), this.opts.backup ? read(`${this.path}.bak`) : null, (v) => (Array.isArray(this.defaults) ? Array.isArray(v) : v !== null && typeof v === 'object' && !Array.isArray(v)))
    if (r.primaryCorrupt) {
      // keep the unreadable file so nothing is lost for good, then carry on from the backup or defaults
      try {
        if (this.opts.backup) copyFileSync(this.path, `${this.path}.corrupt`)
        else renameSync(this.path, `${this.path}.corrupt`) // no backup to fall back on: set the unreadable file aside, never overwrite it
      } catch {
        /* best effort */
      }
      log.warn(`${this.path} was unreadable; ${r.source === 'backup' ? 'restored the last good copy' : 'using defaults'} (the bad file is kept as .corrupt)`)
    }
    if (r.source === 'defaults') return structuredClone(this.defaults)
    if (Array.isArray(this.defaults)) return r.value as T
    let obj = r.value as Record<string, unknown>
    if (this.opts.version !== undefined) {
      const from = typeof obj['__v'] === 'number' ? (obj['__v'] as number) : 0
      if (from < this.opts.version) {
        const m = migrate(obj, from, this.opts.version, this.opts.migrations ?? {})
        if (m.failed) log.warn(`migration of ${this.path} stopped at version ${m.version}`)
        obj = { ...m.data, __v: m.version }
      }
    }
    return { ...this.defaults, ...obj } as T
  }

  get(): T {
    return this.data
  }

  set(next: T): void {
    this.data = next
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      const out = this.opts.version !== undefined && !Array.isArray(this.data) ? { ...this.data, __v: this.opts.version } : this.data
      writeFileSync(tmp, JSON.stringify(out, null, 2))
      // only a file that still parses becomes the backup, so a corrupt file never overwrites the good copy
      const prev = this.opts.backup ? read(this.path) : null
      if (prev !== null && chooseStoreSource(prev, null).source === 'primary') {
        try {
          copyFileSync(this.path, `${this.path}.bak`)
        } catch {
          /* best effort */
        }
      }
      renameSync(tmp, this.path)
    } catch (e) {
      log.error(`failed to write ${this.path}`, e)
    }
  }
}
