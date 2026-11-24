import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')
const core = resolve(__dirname, 'src/core')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared, '@core': core } },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: { '@shared': shared, '@core': core } },
    build: { externalizeDeps: true }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@shared': shared, '@core': core, '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react()],
    // electron-vite ships the renderer unminified by default (a 2 MB script to parse on every launch); minify the JS.
    // CSS stays as written (cssMinify off): the looks are hand-tuned and a CSS minifier may rewrite values.
    build: { minify: 'oxc', cssMinify: false, rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
