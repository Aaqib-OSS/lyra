import { create } from 'zustand'
import { carIsNight } from '@/lib/car'

/**
 * Car mode state. `on` is never persisted: after a restart the user must choose Car mode again (it is meant for
 * passengers or a parked car, so it must not come back by itself).
 */
interface CarStore {
  on: boolean
  night: boolean
  /** the phone sits in a car dock (UiModeManager car mode): Car mode is offered, never forced */
  dock: boolean
  setOn(on: boolean): void
  setEnv(env: { dock?: boolean; night?: boolean | null }): void
}

const root = (): DOMStringMap => document.documentElement.dataset
const prefersLight = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches

function apply(on: boolean, night: boolean): void {
  if (on) root().car = '1'
  else delete root().car
  root().carNight = night ? '1' : '0'
}

export const useCar = create<CarStore>((set, get) => {
  const night0 = root().carNight ? root().carNight === '1' : carIsNight(null, prefersLight())
  const on0 = root().car === '1'
  apply(on0, night0)
  return {
    on: on0,
    night: night0,
    dock: false,
    setOn(on) {
      apply(on, get().night)
      set({ on })
    },
    setEnv(env) {
      const night = env.night === undefined ? get().night : carIsNight(env.night, prefersLight())
      apply(get().on, night)
      set({ night, dock: env.dock ?? get().dock })
    }
  }
})
