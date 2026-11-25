import { useEffect, useState } from 'react'
import type { PersonalScene } from '@shared/types'
import { matchScene } from '@/lib/personalScene'
import { usePlayer } from '@/store/player'

/**
 * Personal scenes (this PC only, see src/main/personal.ts): a look + video for one song, found in a folder outside Lyra.
 * With no folder there are no scenes, this returns null for every song, and Lyra looks exactly as it always did.
 */
let scenes: Promise<PersonalScene[]> | null = null
const load = (): Promise<PersonalScene[]> =>
  (scenes ??= (window.lyra.personal?.get() ?? Promise.resolve([])).catch(() => []))

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
