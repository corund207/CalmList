import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { createApp } from './app.ts'
import { pruneSessions } from './auth.ts'
import { openDb } from './db.ts'

const port = Number(process.env.PORT ?? 8787)
const db = openDb(process.env.DATABASE_PATH ?? 'calmlist.db')
const app = createApp({ db, corsOrigin: process.env.CORS_ORIGIN ?? '*' })

// Serve the built web app from the same origin when it exists (single-process deploys).
const webDir = resolve(import.meta.dirname, process.env.STATIC_DIR ?? '../../web/dist')
if (existsSync(webDir)) {
  const root = relative(process.cwd(), webDir) || '.'
  app.use('/*', serveStatic({ root }))
  app.get('*', serveStatic({ root, path: 'index.html' }))
}

pruneSessions(db)
setInterval(() => pruneSessions(db), 6 * 3_600_000).unref()

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`CalmList server listening on http://localhost:${port}${existsSync(webDir) ? ' (serving web app)' : ''}`)
})
