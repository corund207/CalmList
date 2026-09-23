import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// BASE lets the same build serve at "/" (self-hosted) or "/CalmList/app/" (GitHub Pages).
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node' },
})
