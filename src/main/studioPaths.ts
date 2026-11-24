/**
 * Pure helpers for the export's output files (kept apart from studio.ts so they can be tested without Electron).
 * The renderer may only touch files that THIS session created through the save dialog: it can not make the main
 * process delete or reveal an arbitrary .mp4 on the disk.
 */

/** A name that is safe to offer in the save dialog: no path characters, no Windows-reserved names, not empty. */
export function sanitizeFileName(suggested: unknown, fallback = 'lyra-video.mp4'): string {
  const raw = String(suggested || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 150)
  if (!raw || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(raw)) return fallback
  return /\.mp4$/i.test(raw) ? raw : `${raw}.mp4`
}

/** Is this one of the files the save dialog gave out in this session? (case-insensitive: Windows paths) */
export function isOwnOutput(created: ReadonlySet<string>, path: unknown): path is string {
  return typeof path === 'string' && path.toLowerCase().endsWith('.mp4') && created.has(path.toLowerCase())
}

/** The file next to the video with a suffix and another extension, e.g. `song.mp4` -> `song (cover).jpg`. Null if it is not an .mp4 path. */
export function outputSibling(videoPath: string, suffix: string, ext: string): string | null {
  if (!/\.mp4$/i.test(videoPath)) return null
  if (!/^[a-z0-9]{1,5}$/i.test(ext)) return null
  return videoPath.replace(/\.mp4$/i, `${suffix}.${ext}`)
}
