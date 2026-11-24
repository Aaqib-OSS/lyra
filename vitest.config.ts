import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared'), '@core': resolve(__dirname, 'src/core') } },
  test: {
    include: ['src/**/*.test.ts'],
    // `npm run test:coverage` (needs @vitest/coverage-v8: CI installs it, see docs/testing.md). Numbers only, no thresholds yet.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/renderer/src/**/*.tsx'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage'
    }
  }
})
