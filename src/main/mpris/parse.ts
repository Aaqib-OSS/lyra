/**
 * Linux groundwork: the Windows build reads Spotify (or any player) through the system media controls (SMTC). On Linux the
 * same thing is MPRIS over D-Bus; the least-risk way to read it without a native module is the `playerctl` tool:
 *
 *   playerctl --follow metadata --format <PLAYERCTL_FORMAT>
 *
 * prints one tab-separated line whenever something changes. This file is the pure part (line -> state); source.ts runs the
 * process. Nothing here touches Electron, so it is unit-tested on any OS.
 */
export const PLAYERCTL_FORMAT = '{{status}}\t{{position}}\t{{mpris:length}}\t{{artist}}\t{{title}}\t{{album}}\t{{mpris:artUrl}}\t{{playerName}}'

export interface MprisState {
  playing: boolean
  /** true when a player exists but is stopped or has nothing loaded */
  idle: boolean
  positionMs: number
  durationMs: number
  artist: string
  title: string
  album: string
  /** only https artwork is used; file:// covers need reading from disk (not done yet) */
  artUrl: string | null
  player: string
}

/** Parses one line of `playerctl --follow metadata --format PLAYERCTL_FORMAT`; null when it is not a state line. */
export function parsePlayerctlLine(raw: string): MprisState | null {
  const line = raw.replace(/\r?\n$/, '')
  if (!line.trim()) return null
  const f = line.split('\t')
  if (f.length < 8) return null
  const [status, position, length, artist, title, album, art, player] = f as [string, string, string, string, string, string, string, string]
  const st = status.trim().toLowerCase()
  if (st !== 'playing' && st !== 'paused' && st !== 'stopped') return null
  const us = (v: string): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) : 0 // MPRIS reports microseconds
  }
  const cover = art.trim()
  return {
    playing: st === 'playing',
    idle: st === 'stopped' || !title.trim(),
    positionMs: us(position),
    durationMs: us(length),
    artist: artist.trim(),
    title: title.trim(),
    album: album.trim(),
    artUrl: /^https:\/\//i.test(cover) ? cover : null,
    player: player.trim()
  }
}

/** The `playerctl` argument for a transport command, or null when MPRIS can't do it through playerctl here. */
export function playerctlArgs(cmd: { type: string; positionMs?: number; percent?: number }): string[] | null {
  switch (cmd.type) {
    case 'play':
    case 'pause':
    case 'next':
    case 'previous':
      return [cmd.type]
    case 'toggle':
      return ['play-pause']
    case 'seek':
      return typeof cmd.positionMs === 'number' && cmd.positionMs >= 0 ? ['position', (cmd.positionMs / 1000).toFixed(3)] : null
    case 'volume':
      return typeof cmd.percent === 'number' ? ['volume', (Math.min(100, Math.max(0, cmd.percent)) / 100).toFixed(2)] : null
    default:
      return null
  }
}
