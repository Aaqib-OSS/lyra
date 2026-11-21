import { rpc } from './rpc'

/**
 * Asks the app about the car environment (phone docked in a car dock, day or night) and keeps the Car mode store
 * up to date. It only OFFERS Car mode; entering it is always the user's tap (see docs/android-car.md).
 */
export async function startCarWatcher(): Promise<void> {
  const { useCar } = await import('@/store/car')
  const poll = (): void => {
    rpc<{ dock: boolean; night: boolean | null }>('carInfo')
      .then((i) => useCar.getState().setEnv({ dock: i.dock, night: i.night }))
      .catch(() => undefined) // an older app build without the method: no offer, nothing else changes
  }
  poll()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && poll())
  window.addEventListener('focus', poll)
}
