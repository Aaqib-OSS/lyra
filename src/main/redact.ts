/**
 * Takes secrets and personal paths out of text before it is written to the log or shown in "Copy diagnostics".
 * Pure (no Electron), so it is unit-tested.
 */
const SECRET_PARAMS = 'code|state|code_verifier|key|api_key|apikey|access_token|refresh_token|client_secret|token|t|d'

export function redact(text: string): string {
  return (
    text
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
      .replace(/((?:access|refresh)_token["':=\s]+)[A-Za-z0-9._~+/-]+/gi, '$1[redacted]')
      // query strings and the #fragment secrets of Connect overlay links
      .replace(new RegExp(`([?&#](?:${SECRET_PARAMS})=)[^&#\\s"']+`, 'gi'), '$1[redacted]')
      // a Google API key, wherever it ended up (the YouTube key is sent as ?key=)
      .replace(/AIza[0-9A-Za-z_-]{30,}/g, '[redacted]')
      // the Windows account name in a path
      .replace(/([A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/))[^\\/\s"']+/gi, '$1<user>')
  )
}
