import { app, shell } from 'electron'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scrubText } from '../core/reliability'
import { redact } from './redact'
import { isSafeMode, startupState, usingSoftwareRendering } from './crashGuard'
import { logDirectory, readLogTail, recentProblems } from './logger'
import { settings } from './settings'

const kb = (n: number): string => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

function dirSize(dir: string, depth = 2): number {
  let total = 0
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      try {
        const st = statSync(p)
        total += st.isDirectory() ? (depth > 0 ? dirSize(p, depth - 1) : 0) : st.size
      } catch {
        /* vanished */
      }
    }
  } catch {
    /* missing */
  }
  return total
}

function largestEntries(dir: string): string {
  try {
    return readdirSync(dir)
      .map((name) => {
        const p = join(dir, name)
        try {
          return { name, size: statSync(p).isDirectory() ? dirSize(p) : statSync(p).size }
        } catch {
          return { name, size: 0 }
        }
      })
      .sort((x, y) => y.size - x.size)
      .slice(0, 8)
      .map((e) => `${e.name} ${kb(e.size)}`)
      .join(' · ')
  } catch {
    return 'unknown'
  }
}

/** What this run knows about the app's own state, with every secret and personal value left out. */
export async function buildDiagnostics(sourceLine: string): Promise<string> {
  const { spotifyClientId, position, youtubeKey, songVibes, ...safe } = settings.get() as unknown as Record<string, unknown>
  const userData = app.getPath('userData')
  let gpu = 'unknown'
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: Array<{ vendorId?: number; deviceId?: number; active?: boolean }> }
    gpu = (info.gpuDevice ?? []).map((d) => `${d.vendorId?.toString(16)}:${d.deviceId?.toString(16)}${d.active ? ' (active)' : ''}`).join(', ') || 'unknown'
  } catch {
    /* not available */
  }
  const caches = largestEntries(userData)
  const problems = recentProblems()
  const report = [
    `Lyra ${app.getVersion()} (${app.isPackaged ? 'installed' : 'dev'})`,
    `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
    `OS ${process.platform} ${process.getSystemVersion()} · ${process.arch}`,
    `GPU ${gpu} · software rendering: ${usingSoftwareRendering() ? 'yes' : 'no'}`,
    `Safe mode: ${isSafeMode() ? 'yes' : 'no'} · unfinished starts before this one: ${startupState().crashes}`,
    sourceLine,
    `Settings (secrets left out): ${JSON.stringify({ ...safe, spotifyClientId: spotifyClientId ? 'set' : null, youtubeKey: youtubeKey ? 'set' : null, position: position ? 'set' : null, songVibes: songVibes && typeof songVibes === 'object' ? Object.keys(songVibes).length : 0 })}`,
    `Biggest items in the data folder: ${caches}`,
    `--- recent warnings and errors (this run) ---`,
    problems.length ? problems.join('\n') : '(none)',
    '--- recent log ---',
    readLogTail(120)
  ].join('\n')
  return redact(scrubText(report, app.getPath('home')))
}

export function openLogFolder(): Promise<string> {
  return shell.openPath(logDirectory())
}
