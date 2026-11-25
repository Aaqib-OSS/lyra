import { useEffect, useState } from 'react'
import type { PersonalScene } from '@shared/types'
import { matchScene } from '@/lib/personalScene'
import { usePlayer } from '@/store/player'

/**
 * Personal scenes (this PC only, see src/main/personal.ts): a look + video for one song, found in a folder outside Lyra.
 * With no folder there are no scenes, this returns null for every song, and Lyra looks exactly as it always did.
 */
let scenes: Promise<PersonalScene[]> | null = null
/**
 * The first page a sandboxed frame loads from the scene folder waits several seconds for the frame's own process to start (more
 * on a busy PC). Start that process early with one tiny hidden frame, only on a PC that has a scene, so the scene shows at once.
 */
function warmUp(): void {
  if (document.getElementById('pscene-warm')) return
  const f = document.createElement('iframe')
  f.id = 'pscene-warm'
  f.setAttribute('sandbox', 'allow-scripts')
  f.setAttribute('aria-hidden', 'true')
  f.tabIndex = -1
  f.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  f.src = 'lyra-media://personal/warm'
  document.body.appendChild(f)
}
const load = (): Promise<PersonalScene[]> =>
  (scenes ??= (window.lyra.personal?.get() ?? Promise.resolve([]))
    .catch(() => [])
    .then((l) => {
      if (l.length) warmUp()
      return l
    }))

/** Called once when the app starts: finds the scenes and, if there are any, starts the hidden frame early. */
export function warmPersonalScenes(): void {
  void load()
}

export function usePersonalScene(): PersonalScene | null {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const [list, setList] = useState<PersonalScene[]>([])
  useEffect(() => {
    let live = true
    void load().then((l) => live && setList(l))
    return () => {
      live = false
    }
  }, [])
  const scene = matchScene(list, track)
  // the rest of the screen (the look's backdrop and effects) stays out of the way while a scene is showing
  const id = scene?.id ?? null
  useEffect(() => {
    const el = document.documentElement
    if (id) el.dataset.pscene = id
    else delete el.dataset.pscene
    return () => {
      delete el.dataset.pscene
    }
  }, [id])
  return scene
}
