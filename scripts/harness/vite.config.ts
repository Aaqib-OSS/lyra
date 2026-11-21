import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
const root = resolve(__dirname, '../..')
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5199, fs: { allow: [root] } },
  resolve: { alias: { '@shared': resolve(root, 'src/shared'), '@core': resolve(root, 'src/core'), '@': resolve(root, 'src/renderer/src') } }
})
