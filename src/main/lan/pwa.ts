/** Web-app manifest for the browser / TV viewer, so it can be installed or added to a home screen and open full screen. */
export interface ManifestOptions {
  /** the room key; the installed app has to open the same link */
  token: string
  /** edge length of /icon.png in pixels */
  iconSize: number
}

export function buildManifest(o: ManifestOptions): Record<string, unknown> {
  const k = encodeURIComponent(o.token)
  const size = `${o.iconSize}x${o.iconSize}`
  return {
    name: 'Lyra',
    short_name: 'Lyra',
    description: 'Synced lyrics for whatever is playing in Lyra',
    id: `/?k=${k}`,
    start_url: `/?k=${k}`,
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: '#050505',
    theme_color: '#050505',
    icons: [
      { src: `/icon.png?k=${k}`, sizes: size, type: 'image/png', purpose: 'any' }
    ]
  }
}

/** The room key is hex; refuse to splice anything else into a page. */
export function safeToken(t: string): string {
  return /^[0-9a-f]{4,64}$/i.test(t) ? t : ''
}
