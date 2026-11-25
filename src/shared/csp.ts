/**
 * The content security policy of the installed app. main/index.ts sends it as a response header and the renderer
 * build also puts it in index.html as a <meta> tag, so the policy still holds if a header is ever not applied to a
 * file:// page. Keep ONE definition here.
 */
export function productionCsp(mediaScheme: string): string {
  const media = `${mediaScheme}:`
  const embed = 'https://www.youtube-nocookie.com'
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${media}; media-src 'self' ${media} https://*.itunes.apple.com; frame-src ${embed} ${media}; font-src 'self' data:; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com; object-src 'none'; base-uri 'none'; form-action 'none'`
}
