// Android entry: install the phone's `window.lyra` first, then start the same React app as on Windows.
import { ready } from './api'

await ready

// ?tv=1 is the Android TV activity: same page and bridge, data-platform="tv" (10-foot layout, remote control; see tv.ts)
const tv = new URLSearchParams(location.search).has('tv')
document.documentElement.dataset.platform = tv ? 'tv' : 'android'
// the TV is laid out as a 1920-wide page whatever the screen's density (the activity enables the wide viewport), so 10-foot sizes in CSS are the same on every TV
if (tv) document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=1920, viewport-fit=cover')
if (new URLSearchParams(location.search).has('overlay')) document.documentElement.dataset.overlay = '1'

const params = new URLSearchParams(location.search)

if (params.has('record')) {
  // the page Android films for a lyric video (clean lyrics + the song's video)
  document.documentElement.dataset.ambient = '1'
  await import('./record')
} else if (params.has('ambient')) {
  // the dim always-on-display style screen (also used by the screen saver)
  document.documentElement.dataset.ambient = '1'
  await import('./ambient')
} else {
  void import('@/main').then(async () => {
    const { startLyricNotifier } = await import('./lyricNotifier')
    startLyricNotifier()
    const { startAmbientConfig } = await import('./ambientConfig')
    startAmbientConfig()
    const { useUi, requestMode } = await import('@/store/ui')
    // hardware / gesture Back: close a panel, leave the cinema layout, otherwise let the app go to the background
    window.__lyraNative!.back = () => {
      const ui = useUi.getState()
      if (ui.panel !== 'none') {
        ui.setPanel('none')
        return true
      }
      if (ui.mode === 'full') {
        requestMode('mini')
        return true
      }
      return false
    }
    if (tv) {
      const { startTv } = await import('./tv')
      const { rpc } = await import('./rpc')
      startTv({ rpc, exit: () => void rpc('finish') }) // after the handler above: the TV's Back replaces it
    }
  })
}
