import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { productionCsp } from './src/shared/csp'

const shared = resolve(__dirname, 'src/shared')
const core = resolve(__dirname, 'src/core')

/** The installed app's CSP also goes into index.html (defense in depth: main/index.ts sets the same policy as a response header). */
const cspMeta = (): Plugin => ({
  name: 'lyra-csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: productionCsp('lyra-media') }, injectTo: 'head-prepend' }]
})

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
    plugins: [react(), cspMeta()],
    // electron-vite ships the renderer unminified by default (a 2 MB script to parse on every launch); minify the JS.
    // CSS stays as written (cssMinify off): the looks are hand-tuned and a CSS minifier may rewrite values.
    build: { minify: 'oxc', cssMinify: false, rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
