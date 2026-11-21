// Node module hooks so a plain script can import the app's TypeScript (src/main/connect/*) with the same
// aliases the build uses: @core/* and @shared/* -> src/core/*, src/shared/*; extensionless relative imports -> .ts.
// Register with: register('./ts-alias-hooks.mjs', import.meta.url) and run node with --experimental-transform-types.
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../src')
const ALIASES = { '@core/': resolvePath(SRC, 'core') + '/', '@shared/': resolvePath(SRC, 'shared') + '/' }

export async function resolve(specifier, context, next) {
  for (const [prefix, dir] of Object.entries(ALIASES)) {
    if (specifier.startsWith(prefix)) return next(pathToFileURL(dir + specifier.slice(prefix.length) + '.ts').href, context)
  }
  if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier) && context.parentURL?.startsWith('file:')) {
    const f = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier + '.ts')
    if (existsSync(f)) return next(pathToFileURL(f).href, context)
  }
  return next(specifier, context)
}
