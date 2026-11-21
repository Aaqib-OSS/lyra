import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: resolve(__dirname, '..'),
  test: { include: ['scripts/bench-recording.ts'], pool: 'forks', poolOptions: { forks: { execArgv: ['--expose-gc'] } }, disableConsoleIntercept: true }
})
