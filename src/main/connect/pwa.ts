/**
 * Web-app manifest for the viewer page, so a phone, tablet or TV browser can install it or add it to the home screen and
 * open it full screen. It holds no secrets: the page is static and pairing credentials live in the browser's own storage.
 */
export interface ManifestOptions {
  /** edge length of /icon.png in pixels; 0 when there is no icon */
  iconSize: number
}

export function buildManifest(o: ManifestOptions): Record<string, unknown> {
  const size = `${o.iconSize}x${o.iconSize}`
  return {
    name: 'Lyra',
    short_name: 'Lyra',
    description: 'Synced lyrics for whatever is playing in Lyra',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: '#0b0b10',
    theme_color: '#0b0b10',
    icons: o.iconSize > 0 ? [{ src: '/icon.png', sizes: size, type: 'image/png', purpose: 'any' }] : []
  }
}
