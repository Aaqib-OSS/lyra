import { useEffect, useState } from 'react'
import { extractPalette, NEUTRAL_PALETTE, type Palette } from '@/lib/palette'

const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

export function loadArtwork(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)
  let p = pending.get(url)
  if (!p) {
    p = window.lyra.art
      .get(url)
      .catch(() => null)
      .then((d) => {
        cache.set(url, d)
        if (cache.size > 30) cache.delete(cache.keys().next().value as string)
        pending.delete(url)
        return d
      })
    pending.set(url, p)
  }
  return p
}

/** Resolves a remote artwork URL to a locally cached data URL (or null while loading / on failure). */
export function useArtwork(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(url && cache.has(url) ? (cache.get(url) ?? null) : null)
  useEffect(() => {
    let live = true
    if (!url) {
      setSrc(null)
      return
    }
    if (cache.has(url)) setSrc(cache.get(url) ?? null)
    else void loadArtwork(url).then((d) => live && setSrc(d))
    return () => {
      live = false
    }
  }, [url])
  return src
}

export function usePalette(src: string | null): Palette {
  const [pal, setPal] = useState<Palette>(NEUTRAL_PALETTE)
  useEffect(() => {
    let live = true
    if (!src) {
      setPal(NEUTRAL_PALETTE)
      return
    }
    void extractPalette(src).then((p) => live && setPal(p))
    return () => {
      live = false
    }
  }, [src])
  return pal
}

const tinyCache = new Map<string, string>()

/**
 * The cover as a tiny, already blurred and saturated picture (64 px). The backdrop scales it up to the whole window,
 * which looks like a heavy blur but costs the GPU nothing: no live blur filter on a screen-sized, animating image.
 */
export function useTinyArt(src: string | null): string | null {
  const [tiny, setTiny] = useState<string | null>(src ? (tinyCache.get(src) ?? null) : null)
  useEffect(() => {
    let live = true
    if (!src) {
      setTiny(null)
      return
    }
    const hit = tinyCache.get(src)
    if (hit) {
      setTiny(hit)
      return
    }
    const img = new Image()
    img.onload = () => {
      if (!live) return
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const ctx = c.getContext('2d')!
        ctx.filter = 'blur(2.2px) saturate(1.5) brightness(1.08)'
        // a little larger than the canvas so the blur does not fade out at the edges
        ctx.drawImage(img, -6, -6, 76, 76)
        const url = c.toDataURL('image/jpeg', 0.8)
        tinyCache.set(src, url)
        if (tinyCache.size > 20) tinyCache.delete(tinyCache.keys().next().value as string)
        setTiny(url)
      } catch {
        setTiny(src)
      }
    }
    img.onerror = () => live && setTiny(src)
    img.src = src
    return () => {
      live = false
    }
  }, [src])
  return tiny
}
