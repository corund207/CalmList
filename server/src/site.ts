// The whole deployment in one Hono app: the site's endpoints (MCP, stats, status check), the sync API,
// and the built site (landing page at "/", the app at "/app/") with security and cache headers.
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp, type Options } from './app.ts'

/** A web-standard handler module from functions/, with one export per HTTP method. */
export type Endpoint = Partial<Record<string, (req: Request) => Response | Promise<Response>>>

export interface SiteOptions extends Options {
  /** Directory with the built site, relative to the working directory. */
  staticRoot?: string
  endpoints?: Partial<Record<'mcp' | 'stats' | 'status-check', Endpoint>>
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  // connect-src stays open: people point the app at their own Supabase, Ollama or AI endpoint.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    'connect-src * data: blob:',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    'frame-src https://accounts.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
}

/**
 * Built files carry content hashes, so they never change; pages, the service worker and the manifest always
 * revalidate. no-transform keeps the CDN from rewriting pages, such as injecting an analytics beacon.
 */
export const cacheControl = (path: string) => {
  if (path.startsWith('/app/assets/')) return 'public, max-age=31536000, immutable'
  if (path.endsWith('/') || /\.(html|webmanifest)$/.test(path) || path.endsWith('/sw.js')) return 'no-cache, no-transform'
  return 'public, max-age=3600'
}

export const run = (endpoint: Endpoint, req: Request) =>
  endpoint[req.method]?.(req) ?? new Response('Method Not Allowed', { status: 405 })

export const createSite = ({ staticRoot, endpoints = {}, ...options }: SiteOptions) => {
  const site = new Hono()

  site.use('*', async (c, next) => {
    await next()
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v)
  })

  // Registered before the sync API, so its sign-in check doesn't apply to them.
  for (const [name, endpoint] of Object.entries(endpoints)) site.all(`/api/${name}`, (c) => run(endpoint!, c.req.raw))
  const { mcp } = endpoints
  if (mcp) {
    // The token in the path, for clients that can't send headers: /api/mcp/<token>.
    site.all('/api/mcp/:token', async (c) => {
      const url = new URL(c.req.url)
      url.searchParams.set('token', c.req.param('token'))
      const body = ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer()
      return run(mcp, new Request(url, { method: c.req.method, headers: c.req.raw.headers, body }))
    })
  }

  site.route('/', createApp(options))

  if (staticRoot) {
    // The app's files are relative to its folder, so it must be opened with the trailing slash.
    site.get('/app', (c) => c.redirect('/app/', 301))
    site.use('/*', async (c, next) => {
      await next()
      if (c.res.ok && !c.req.path.startsWith('/api/')) c.res.headers.set('Cache-Control', cacheControl(c.req.path))
    })
    site.use('/*', serveStatic({ root: staticRoot }))
  }

  return site
}
