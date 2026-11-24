import { resolve } from 'node:path'

/**
 * The files an export is allowed to touch afterwards. The save dialog (which the user clicks) is the only way a path
 * enters this list, so a page that asks main to "discard", "reveal" or put a cover next to some other file is refused:
 * no deleting `C:\anything.mp4`, no writing a .jpg beside an arbitrary video.
 */
export class ExportPaths {
  private readonly known = new Set<string>()
  constructor(private readonly max = 200) {}

  private key(p: string): string {
    const full = resolve(p)
    return process.platform === 'win32' ? full.toLowerCase() : full
  }

  allow(p: string): void {
    this.known.add(this.key(p))
    // keep the list small: forget the oldest
    if (this.known.size > this.max) this.known.delete(this.known.values().next().value as string)
  }

  has(p: unknown): p is string {
    return typeof p === 'string' && p.length > 0 && p.length < 1024 && this.known.has(this.key(p))
  }

  forget(p: string): void {
    this.known.delete(this.key(p))
  }
}

/** A chunk of an exported video: bytes, a sane size, and a sane place in the file. */
export function validChunk(position: unknown, chunk: unknown): chunk is Uint8Array {
  return (
    typeof position === 'number' &&
    Number.isSafeInteger(position) &&
    position >= 0 &&
    position < 2 ** 36 && // 64 GiB: far beyond any lyric video
    chunk instanceof Uint8Array &&
    chunk.byteLength > 0 &&
    chunk.byteLength <= 128 * 1024 * 1024
  )
}
