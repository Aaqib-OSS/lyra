import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from './logger'

const log = createLogger('store')

/** Tiny atomic, debounced JSON file store living in userData. */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  readonly path: string

  constructor(name: string, private readonly defaults: T, private readonly backup = false) {
    this.path = join(app.getPath('userData'), name)
    this.data = this.load()
  }

  private parse(file: string): T {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<T>
    if (!parsed || typeof parsed !== 'object') throw new Error('not a JSON object or array')
    return Array.isArray(this.defaults) ? (parsed as T) : { ...this.defaults, ...parsed }
  }

  private load(): T {
    if (!existsSync(this.path)) return structuredClone(this.defaults)
    try {
      return this.parse(this.path)
    } catch (e) {
      log.warn(`could not read ${this.path}`, e)
    }
    // Unreadable: keep the broken file for inspection (never silently overwrite it), then try the last good copy.
    try {
      if (this.backup) copyFileSync(this.path, `${this.path}.corrupt`)
    } catch {
      /* best effort */
    }
    try {
      if (this.backup && existsSync(`${this.path}.bak`)) {
        const restored = this.parse(`${this.path}.bak`)
        log.warn(`restored ${this.path} from its backup`)
        return restored
      }
    } catch (e) {
      log.warn(`backup of ${this.path} is unreadable too, using defaults`, e)
    }
    return structuredClone(this.defaults)
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
      writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      // keep the previous good file as the backup before it is replaced (a crash between the two steps loses nothing)
      // (opt-in: stores that hold things a user can delete, like history, must not keep an older copy around)
      try {
        if (this.backup && existsSync(this.path)) {
          JSON.parse(readFileSync(this.path, 'utf8')) // never replace a good backup with a broken file
          copyFileSync(this.path, `${this.path}.bak`)
        }
      } catch {
        /* the backup is a bonus */
      }
      renameSync(tmp, this.path)
    } catch (e) {
      log.error(`failed to write ${this.path}`, e)
    }
  }
}
