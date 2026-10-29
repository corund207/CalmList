import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Files larger than this (on-device AI runtimes) are cached on first use instead of at install. */
const PRECACHE_LIMIT = 2 * 1024 * 1024

/** Writes sw.js into the build, with every file it should cache up front and a version that changes with them. */
const serviceWorker = (): Plugin => {
  let outDir = ''
  return {
    name: 'calmlist-service-worker',
    apply: 'build',
    configResolved: (config) => void (outDir = resolve(config.root, config.build.outDir)),
    closeBundle() {
      const files = (readdirSync(outDir, { recursive: true }) as string[])
        .map((f) => f.split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && statSync(join(outDir, f)).isFile())
        .sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const precache = ['./', ...files.filter((f) => f !== 'index.html' && statSync(join(outDir, f)).size <= PRECACHE_LIMIT)]
      const source = readFileSync(resolve(import.meta.dirname, 'sw.js'), 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(precache))
      writeFileSync(join(outDir, 'sw.js'), source)
      this.info(`sw.js precaches ${precache.length} files from ${relative(process.cwd(), outDir)}`)
    },
  }
}

// BASE lets the same build serve at "/" (the CalmList server) or "./" (the site's /app/ folder and the native shell).
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react(), serviceWorker()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node' },
})
