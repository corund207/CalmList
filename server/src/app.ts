import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { createSession, createUser, deleteSession, findUserByEmail, userForToken, verifyPassword, type User } from './auth.ts'
import type { DB } from './db.ts'
import { GoogleError, type Google } from './google.ts'
import { KINDS, writeChanges, type Change } from './items.ts'
import { liveStream } from './live.ts'

const MAX_BATCH = 2000
const MAX_DOC = 64 * 1024

type Env = { Variables: { user: User; token: string } }

const bad = (message: string, status: 400 | 401 | 409 | 429 = 400) => new HTTPException(status, { message })

/** A small fixed-window limiter for the auth endpoints, keyed by client address. */
const limiter = (limit: number, windowMs: number) => {
  const hits = new Map<string, { n: number; reset: number }>()
  return (key: string) => {
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > limit) throw bad('Too many attempts. Try again in a minute.', 429)
  }
}

const validChange = (c: unknown): c is Change => {
  if (!c || typeof c !== 'object') return false
  const { kind, id, data } = c as Change
  if (typeof kind !== 'string' || !KINDS.has(kind)) return false
  if (typeof id !== 'string' || !id || id.length > 64) return false
  if (data === null) return true
  return typeof data === 'object' && !Array.isArray(data) && data.id === id
}

export interface Options {
  db: DB
  corsOrigin?: string
  /** Server-side Google Calendar sync, when the server has a Google client configured. */
  google?: Google
}

export const createApp = ({ db, corsOrigin = '*', google }: Options) => {
  const app = new Hono<Env>()
  const authLimit = limiter(20, 60_000)

  app.use('/api/*', cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()),
    allowHeaders: ['content-type', 'authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    if (err instanceof GoogleError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Something went wrong' }, 500)
  })

  app.get('/api/health', (c) => c.json({ ok: true }))

  /* ─── Auth ─── */

  const clientKey = (c: { req: { header(n: string): string | undefined } }) => c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'

  app.post('/api/auth/signup', async (c) => {
    authLimit(clientKey(c))
    const { email, password, name } = await c.req.json<{ email?: string; password?: string; name?: string }>().catch(() => ({}) as never)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address.')
    if (!password || password.length < 8) throw bad('Use a password of at least 8 characters.')
    if (password.length > 200) throw bad('That password is too long.')
    if (findUserByEmail(db, email)) throw bad('An account with that email already exists.', 409)
    const user = createUser(db, email, (name || email.split('@')[0]).slice(0, 80), password)
    return c.json({ token: createSession(db, user.id), user }, 201)
  })

  app.post('/api/auth/login', async (c) => {
    authLimit(clientKey(c))
    const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as never)
    const row = email && password ? findUserByEmail(db, email) : undefined
    if (!row || !verifyPassword(password!, row.password)) throw bad('Email or password is incorrect.', 401)
    const user = { id: row.id, email: row.email, name: row.name }
    return c.json({ token: createSession(db, user.id), user })
  })

  // Google's push notifications carry a per-channel token instead of a session.
  app.post('/api/google/push', (c) => (google?.onPush(c.req.raw.headers), c.body(null, 200)))

  app.use('/api/*', async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const user = token ? userForToken(db, token) : undefined
    if (!user) throw bad('Sign in to continue.', 401)
    c.set('user', user)
    c.set('token', token!)
    await next()
  })

  app.get('/api/me', (c) => c.json({ user: c.get('user') }))

  app.post('/api/auth/logout', (c) => {
    deleteSession(db, c.get('token'))
    return c.json({ ok: true })
  })

  /* ─── Sync ─── */

  // Changes since a revision. Deletions come back as { data: null }.
  app.get('/api/sync', (c) => {
    const user = c.get('user')
    const since = Math.max(0, Number(c.req.query('since')) || 0)
    const rows = db.prepare('SELECT kind, id, data, rev FROM items WHERE user_id = ? AND rev > ? ORDER BY rev').all(user.id, since) as
      { kind: string; id: string; data: string | null; rev: number }[]
    const { rev } = db.prepare('SELECT rev FROM users WHERE id = ?').get(user.id) as { rev: number }
    return c.json({ rev, changes: rows.map((r) => ({ kind: r.kind, id: r.id, data: r.data ? JSON.parse(r.data) : null })) })
  })

  // Last write wins: each change gets the next revision number for this user.
  app.post('/api/sync', async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ changes?: unknown[] }>().catch(() => ({}) as never)
    const changes = body.changes
    if (!Array.isArray(changes) || changes.length > MAX_BATCH || !changes.every(validChange)) throw bad('Invalid changes.')
    const docs = changes.map((ch) => (ch.data ? JSON.stringify(ch.data) : null))
    if (docs.some((d) => d && d.length > MAX_DOC)) throw bad('A record is too large.')

    return c.json({ rev: writeChanges(db, user.id, changes) })
  })

  // Tells open apps the moment something changes, so they pull right away instead of on the next poll.
  app.get('/api/live', (c) => liveStream(c.get('user').id, c.req.raw.signal))

  // Everything the user owns, for backups.
  app.get('/api/export', (c) => {
    const rows = db.prepare('SELECT kind, data FROM items WHERE user_id = ? AND data IS NOT NULL').all(c.get('user').id) as { kind: string; data: string }[]
    const out: Record<string, Record<string, unknown>> = Object.fromEntries([...KINDS].map((k) => [k, {}]))
    for (const r of rows) {
      const doc = JSON.parse(r.data)
      out[r.kind][doc.id] = doc
    }
    return c.json(out)
  })

  /* ─── Google Calendar ─── */

  const needGoogle = () => {
    if (!google) throw bad('This server has no Google Calendar client configured.', 409)
    return google
  }
  const body = <T,>(c: { req: { json<U>(): Promise<U> } }) => c.req.json<T>().catch(() => ({}) as T)

  app.get('/api/google', (c) => c.json(google ? { available: true, ...google.status(c.get('user').id) } : { available: false, connected: false }))
  app.post('/api/google/connect', async (c) => {
    const { code, timeZone } = await body<{ code?: string; timeZone?: string }>(c)
    if (!code) throw bad('Missing the Google sign-in code.')
    return c.json(await needGoogle().connect(c.get('user').id, code, timeZone || 'UTC'))
  })
  app.post('/api/google/disconnect', async (c) => {
    const { deleteCalendar } = await body<{ deleteCalendar?: boolean }>(c)
    await needGoogle().disconnect(c.get('user').id, !!deleteCalendar)
    return c.json({ connected: false })
  })
  app.post('/api/google/sync', async (c) => c.json(await needGoogle().sync(c.get('user').id)))
  // A window of up to 100 days; the next 30 by default.
  app.get('/api/google/events', async (c) => {
    const from = new Date(c.req.query('from') ?? Date.now() - 12 * 3600_000)
    const to = new Date(c.req.query('to') ?? from.getTime() + 30 * 86_400_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 100 * 86_400_000) throw bad('Ask for up to 100 days of events.')
    return c.json(await needGoogle().upcoming(c.get('user').id, { from, to }))
  })
  app.post('/api/google/events/add', async (c) => {
    const { key } = await body<{ key?: string }>(c)
    if (!key?.includes('|')) throw bad('Which event?')
    return c.json({ taskId: await needGoogle().pick(c.get('user').id, key) })
  })
  app.post('/api/google/events/dismiss', async (c) => {
    const { key, undo } = await body<{ key?: string; undo?: boolean }>(c)
    if (!key?.includes('|')) throw bad('Which event?')
    needGoogle().dismiss(c.get('user').id, key, !!undo)
    return c.json({ ok: true })
  })

  app.delete('/api/account', (c) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(c.get('user').id)
    return c.json({ ok: true })
  })

  return app
}
