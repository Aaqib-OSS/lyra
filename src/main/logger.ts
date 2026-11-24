import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { rotationMoves, scrubText, shouldRotate } from '../core/reliability'
import { redact as redactSecrets } from './redact'

type Level = 'debug' | 'info' | 'warn' | 'error'
const MAX_BYTES = 1_000_000
const KEEP = 3 // lyra.log + lyra.1.log .. lyra.3.log (about 4 MB at most)

let dir: string | null = null
let file: string | null = null
let written = 0
const recent: string[] = []

function logFile(): string | null {
  if (file) return file
  try {
    dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'lyra.log')
    try {
      written = statSync(file).size
      if (shouldRotate(written, MAX_BYTES)) rotate()
    } catch {
      /* no existing log */
    }
  } catch {
    file = null
  }
  return file
}

function rotate(): void {
  if (!dir) return
  try {
    for (const m of rotationMoves('lyra.log', KEEP)) {
      const from = join(dir, m.from)
      if (!existsSync(from)) continue
      const to = join(dir, m.to)
      if (existsSync(to)) rmSync(to, { force: true })
      renameSync(from, to)
    }
    written = 0
  } catch {
    /* rotation is best effort */
  }
}

/** Folder holding the log files (created on demand). */
export function logDirectory(): string {
  logFile()
  return dir ?? join(app.getPath('userData'), 'logs')
}

/** Strip anything personal (tokens, keys, e-mails, the OS user name, LAN addresses) before logging. */
function redact(text: string): string {
  return redactSecrets(scrubText(text, safeHome())) // the app's scrubber plus the extra key / link-secret patterns
}

function safeHome(): string | undefined {
  try {
    return app.getPath('home')
  } catch {
    return undefined
  }
}

function write(level: Level, scope: string, args: unknown[]): void {
  const msg = args
    .map((a) => (a instanceof Error ? `${a.message}${a.stack ? `\n${a.stack}` : ''}` : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${redact(msg)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (!app.isPackaged || level !== 'debug') console.log(line)
  if (level === 'warn' || level === 'error') {
    recent.push(line.split('\n')[0]!)
    if (recent.length > 20) recent.shift()
  }
  const f = logFile()
  if (f && level !== 'debug') {
    try {
      if (shouldRotate(written, MAX_BYTES)) rotate()
      appendFileSync(f, line + '\n')
      written += line.length + 1
    } catch {
      /* disk issues must never crash the app */
    }
  }
}

export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => write('debug', scope, a),
    info: (...a: unknown[]) => write('info', scope, a),
    warn: (...a: unknown[]) => write('warn', scope, a),
    error: (...a: unknown[]) => write('error', scope, a)
  }
}

/** The last warnings and errors of this run (already scrubbed). */
export function recentProblems(): string[] {
  return [...recent]
}

/** Last `lines` lines of the log file (secrets are already redacted when written). */
export function readLogTail(lines = 80): string {
  const f = logFile()
  if (!f) return '(no log file)'
  try {
    return readFileSync(f, 'utf8').trimEnd().split(/\r?\n/).slice(-lines).join('\n')
  } catch {
    return '(log empty)'
  }
}
