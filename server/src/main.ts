import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pruneSessions } from './auth.ts'
import { openDb } from './db.ts'
import { createSite, run, type Endpoint, type SiteOptions } from './site.ts'

const port = Number(process.env.PORT ?? 8787)
const db = openDb(process.env.DATABASE_PATH ?? 'calmlist.db')

// The built site to serve from the same origin: `npm run build:site` output, or just the app from web/dist.
const webDir = resolve(import.meta.dirname, process.env.STATIC_DIR ?? '../../web/dist')
const staticRoot = existsSync(webDir) ? relative(process.cwd(), webDir) || '.' : undefined

// The MCP, stats and status-check endpoints, bundled from functions/ by `npm run build:site`.
const functionsDir = resolve(import.meta.dirname, process.env.FUNCTIONS_DIR ?? '../../_functions')
const endpoints: NonNullable<SiteOptions['endpoints']> = {}
for (const name of ['mcp', 'stats', 'status-check'] as const) {
  const file = join(functionsDir, `${name}.mjs`)
  if (existsSync(file)) endpoints[name] = (await import(pathToFileURL(file).href)) as Endpoint
}

const app = createSite({ db, corsOrigin: process.env.CORS_ORIGIN ?? '*', staticRoot, endpoints })

pruneSessions(db)
setInterval(() => pruneSessions(db), 6 * 3_600_000).unref()

// Uptime numbers: probe the service every 30 minutes when the status check is set up.
const statusCheck = endpoints['status-check']
if (statusCheck && process.env.CRON_SECRET) {
  const check = () =>
    Promise.resolve(run(statusCheck, new Request(`http://localhost:${port}/api/status-check`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })))
      .then(async (res) => !res.ok && console.error(`Status check failed (${res.status}): ${await res.text()}`))
      .catch((e) => console.error('Status check failed:', e))
  setTimeout(check, 60_000).unref()
  setInterval(check, 30 * 60_000).unref()
}

serve({ fetch: app.fetch, port }, ({ port }) => {
  const parts = [staticRoot && `serving ${staticRoot}`, Object.keys(endpoints).length && `endpoints: ${Object.keys(endpoints).join(', ')}`].filter(Boolean)
  console.log(`CalmList server listening on http://localhost:${port}${parts.length ? ` (${parts.join('; ')})` : ''}`)
})
