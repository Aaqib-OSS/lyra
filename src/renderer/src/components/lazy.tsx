import { Suspense, lazy, type ComponentProps, type ComponentType } from 'react'

/*
 * Rarely opened screens are loaded on first use, so they stay out of the startup bundle (parse + compile time on every launch,
 * most of all on a phone): the Studio export dialog (with the muxer and the whole recorder), Karaoke, the Settings panel
 * (with the QR code library), the share-card dialog and the Android record dialog. Same look as before: each one is opened by a
 * click, and the chunk is a local file, so the dialog appears a frame or two later and nothing is drawn while it loads.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function later<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): (props: ComponentProps<T>) => React.JSX.Element {
  const Lazy = lazy(load) as unknown as ComponentType<ComponentProps<T>>
  return function Later(props: ComponentProps<T>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
}

export const StudioDialog = later(() => import('./StudioDialog').then((m) => ({ default: m.StudioDialog })))
export const KaraokeScreen = later(() => import('./KaraokeScreen').then((m) => ({ default: m.KaraokeScreen })))
export const SettingsPanel = later(() => import('./SettingsPanel').then((m) => ({ default: m.SettingsPanel })))
export const ShareCard = later(() => import('./ShareCard').then((m) => ({ default: m.ShareCard })))
export const RecordDialog = later(() => import('./RecordDialog').then((m) => ({ default: m.RecordDialog })))
