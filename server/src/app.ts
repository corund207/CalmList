import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { createSession, createUser, deleteSession, findUserByEmail, userForToken, verifyPassword, type User } from './auth.ts'
import { tx, type DB } from './db.ts'

const KINDS = new Set(['projects', 'sections', 'labels', 'filters', 'tasks', 'comments', 'events'])
const MAX_BATCH = 2000
const MAX_DOC = 64 * 1024

interface Change {
  kind: string
  id: string
  data: Record<string, unknown> | null
}

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
}

export const createApp = ({ db, corsOrigin = '*' }: Options) => {
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

    const rev = tx(db, () => {
      const upsert = db.prepare(`INSERT INTO items (user_id, kind, id, data, rev) VALUES (?, ?, ?, ?, ?)
                                 ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, rev = excluded.rev`)
      let { rev } = db.prepare('SELECT rev FROM users WHERE id = ?').get(user.id) as { rev: number }
      changes.forEach((ch, i) => upsert.run(user.id, ch.kind, ch.id, docs[i], ++rev))
      db.prepare('UPDATE users SET rev = ? WHERE id = ?').run(rev, user.id)
      return rev
    })
    return c.json({ rev })
  })

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

  app.delete('/api/account', (c) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(c.get('user').id)
    return c.json({ ok: true })
  })

  return app
}
