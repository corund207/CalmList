// Google Calendar, kept in sync by the server so it keeps going with every app closed.
// - The CalmList calendar syncs both ways: dated tasks become events, and events added or edited there
//   (in Google Calendar, on any device) become or change tasks.
// - The person's other calendars are listed for picking: an event they choose becomes a task.
// Google calls /api/google/push when a watched calendar changes; a poll every 10 minutes covers any gap.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { eventId, fingerprint, planSync, taskFromEvent, taskIdOf, taskPatchFromEvent, toEvent, type GoogleEvent } from '../../web/src/lib/gcal.ts'
import type { Data } from '../../web/src/lib/types.ts'
import type { DB } from './db.ts'
import { loadData, onWrite, writeChanges, type Change } from './items.ts'
import { notify } from './live.ts'

const API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE_OWN = 'https://www.googleapis.com/auth/calendar.app.created'
const SCOPE_READ = 'https://www.googleapis.com/auth/calendar.readonly'
export const GOOGLE_SCOPES = ['openid', 'email', SCOPE_OWN, SCOPE_READ]
const CALENDAR_NAME = 'CalmList'
const CALENDAR_NOTE = 'Your dated CalmList tasks. Events you add here become tasks, and edits sync both ways.'
const WATCH_TTL = 7 * 24 * 3600 // seconds; Google keeps a channel for about a week at most
const POLL = 10 * 60_000
const MAX_WATCHED = 25

export interface GoogleOptions {
  db: DB
  clientId: string
  clientSecret: string
  /** 32 bytes as hex; encrypts refresh tokens at rest. */
  tokenKey: string
  /** This site's origin, where Google sends push notifications. */
  publicUrl: string
  /** The app's address, linked from each event. */
  appUrl: string
  fetch?: typeof fetch
}

export class GoogleError extends Error {
  status: 400 | 404 | 409 | 502
  constructor(message: string, status: 400 | 404 | 409 | 502 = 400) {
    super(message)
    this.status = status
  }
}

/** Google answered 410: an incremental-sync position expired, or the thing was already deleted. */
class Gone extends Error {}

interface Link {
  user_id: string
  email: string
  refresh_token: string
  time_zone: string
  calendar_id: string | null
  sync_token: string | null
  synced: string
  last_sync: number | null
  error: string | null
}

interface Watch {
  user_id: string
  calendar_id: string
  channel_id: string
  resource_id: string
  token: string
  expires_at: number
}

interface CalendarEntry {
  id: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  hidden?: boolean
  selected?: boolean
  accessRole?: string
}

export interface PickableEvent {
  key: string
  calendarId: string
  calendar: string
  color: string | null
  title: string
  start: GoogleEvent['start']
  end: GoogleEvent['end']
  allDay: boolean
  link: string | null
  /** The task made from this event, once picked. */
  taskId: string | null
  dismissed: boolean
}

const enc = encodeURIComponent

const seal = (key: Buffer, text: string) => {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

const unseal = (key: Buffer, sealed: string) => {
  const [iv, tag, body] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

/** The signed-in email from Google's ID token. It came straight from Google over TLS, so the payload is read, not verified. */
const emailOf = (idToken?: string) => {
  try {
    return String(JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8')).email ?? '')
  } catch {
    return ''
  }
}

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch {
    return 'UTC'
  }
}

const inboxOf = (data: Data) => Object.values(data.projects).find((p) => p.inbox)?.id

export type Google = ReturnType<typeof createGoogle>

export function createGoogle(o: GoogleOptions) {
  const { db } = o
  const http = o.fetch ?? fetch
  const key = Buffer.from(o.tokenKey, 'hex')
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes as hex (openssl rand -hex 32).')
  const tokens = new Map<string, { value: string; expires: number }>()
  const queues = new Map<string, Promise<unknown>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const link = (userId: string) => db.prepare('SELECT * FROM google_links WHERE user_id = ?').get(userId) as Link | undefined
  const update = (userId: string, fields: Partial<Omit<Link, 'user_id'>>) => {
    const keys = Object.keys(fields) as (keyof typeof fields)[]
    db.prepare(`UPDATE google_links SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...keys.map((k) => fields[k] ?? null), userId)
  }
  const watches = (userId: string) => db.prepare('SELECT * FROM google_watches WHERE user_id = ?').all(userId) as unknown as Watch[]

  /** One piece of Google work at a time per person, so syncs never interleave. */
  const serial = <T>(userId: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(userId) ?? Promise.resolve()).catch(() => {}).then(fn)
    queues.set(userId, run.catch(() => {}))
    return run
  }

  /* ─── Google APIs ─────────────────────────────────────────────────────── */

  async function oauth(params: Record<string, string>) {
    const res = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, ...params }),
    })
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, string | number | undefined> }
  }

  async function accessToken(userId: string): Promise<string> {
    const cached = tokens.get(userId)
    if (cached && cached.expires > Date.now()) return cached.value
    const l = link(userId)
    if (!l) throw new GoogleError('Google Calendar isn’t connected.', 409)
    const { ok, body } = await oauth({ grant_type: 'refresh_token', refresh_token: unseal(key, l.refresh_token) })
    if (!ok) {
      if (body.error === 'invalid_grant') {
        update(userId, { error: 'Google access was removed. Connect again.' })
        notify(userId, 'google')
        throw new GoogleError('Google access was removed. Connect again.', 409)
      }
      throw new GoogleError(`Google sign-in failed (${body.error ?? 'no answer'}).`, 502)
    }
    tokens.set(userId, { value: String(body.access_token), expires: Date.now() + (Number(body.expires_in ?? 3600) - 60) * 1000 })
    return String(body.access_token)
  }

  async function api<T>(userId: string, path: string, init: RequestInit = {}, retried = false): Promise<T | null> {
    const res = await http(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken(userId)}`, 'content-type': 'application/json', ...init.headers },
    })
    if (res.status === 401 && !retried) {
      tokens.delete(userId)
      return api(userId, path, init, true)
    }
    if (res.status === 404) return null
    if (res.status === 410) throw new Gone()
    if (res.status === 204) return {} as T
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    if (!res.ok) throw new GoogleError(body?.error?.message ?? `Google Calendar responded ${res.status}`, res.status === 409 ? 409 : 502)
    return body as T
  }

  /* ─── The CalmList calendar ───────────────────────────────────────────── */

  /** Finds the CalmList calendar (reusing one from an earlier connection) or makes it. */
  async function ensureCalendar(userId: string): Promise<string> {
    const l = link(userId)!
    if (l.calendar_id && (await api(userId, `/calendars/${enc(l.calendar_id)}`))) return l.calendar_id
    const list = await api<{ items?: CalendarEntry[] }>(userId, '/users/me/calendarList?minAccessRole=owner')
    const id =
      list?.items?.find((c) => c.summary === CALENDAR_NAME)?.id ??
      (await api<{ id: string }>(userId, '/calendars', { method: 'POST', body: JSON.stringify({ summary: CALENDAR_NAME, description: CALENDAR_NOTE, timeZone: l.time_zone }) }))!.id
    update(userId, { calendar_id: id, sync_token: null, synced: '{}' })
    return id
  }

  /** Sends changed dated tasks to the CalmList calendar, and removes finished, undated or deleted ones. */
  async function pushTasks(userId: string) {
    const l = link(userId)
    if (!l?.calendar_id) return
    const data = loadData(db, userId)
    const synced = JSON.parse(l.synced) as Record<string, string>
    const base = `/calendars/${enc(l.calendar_id)}/events`
    const plan = planSync(data, synced, l.time_zone, o.appUrl)
    for (const event of plan.upsert) {
      const body = JSON.stringify({ ...event, status: 'confirmed' })
      if (!(await api(userId, `${base}/${event.id}`, { method: 'PUT', body }))) {
        try {
          await api(userId, base, { method: 'POST', body })
        } catch (e) {
          // The id was used before and deleted; Google keeps it, so bring it back instead.
          if ((e as GoogleError).status === 409) await api(userId, `${base}/${event.id}`, { method: 'PUT', body })
          else throw e
        }
      }
      synced[event.extendedProperties.private.calmlist] = fingerprint(event)
      update(userId, { synced: JSON.stringify(synced) })
    }
    for (const taskId of plan.remove) {
      const task = data.tasks[taskId]
      // A deleted task is gone from the data, so find its event by the task id CalmList stamped on it.
      const found = task
        ? null
        : await api<{ items?: GoogleEvent[] }>(userId, `${base}?privateExtendedProperty=${enc(`calmlist=${taskId}`)}&maxResults=1`)
      const id = task?.calendarEventId ?? found?.items?.[0]?.id ?? eventId(taskId)
      try {
        await api(userId, `${base}/${id}`, { method: 'DELETE' })
      } catch (e) {
        if (!(e instanceof Gone)) throw e
      }
      delete synced[taskId]
      update(userId, { synced: JSON.stringify(synced) })
    }
  }

  /** Reads what changed in the CalmList calendar since last time and applies it to tasks. */
  async function pullCalendar(userId: string): Promise<void> {
    const l = link(userId)
    if (!l?.calendar_id) return
    const base = `/calendars/${enc(l.calendar_id)}/events`
    const events: GoogleEvent[] = []
    let pageToken: string | undefined
    let nextSync: string | undefined
    try {
      do {
        const q = new URLSearchParams({ maxResults: '250', ...(l.sync_token ? { syncToken: l.sync_token } : {}), ...(pageToken ? { pageToken } : {}) })
        const page = await api<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(userId, `${base}?${q}`)
        events.push(...(page?.items ?? []))
        pageToken = page?.nextPageToken
        nextSync = page?.nextSyncToken ?? nextSync
      } while (pageToken)
    } catch (e) {
      if (!(e instanceof Gone) || !l.sync_token) throw e
      // The position expired: read everything again.
      update(userId, { sync_token: null })
      return pullCalendar(userId)
    }
    await apply(userId, events, !l.sync_token)
    update(userId, { sync_token: nextSync ?? null })
  }

  async function apply(userId: string, events: GoogleEvent[], firstRead: boolean) {
    const l = link(userId)!
    const data = loadData(db, userId)
    const synced = JSON.parse(l.synced) as Record<string, string>
    const inbox = inboxOf(data)
    const now = Date.now()
    const changes: Change[] = []
    const stamp: { event: string; task: string }[] = []
    // Deleted events arrive with just an id, so map the ids CalmList gave its events back to tasks.
    const byEvent = new Map(Object.keys(synced).map((tid) => [data.tasks[tid]?.calendarEventId ?? eventId(tid), tid]))
    const eventOf = (t: (typeof data.tasks)[string]) => toEvent(t, data, l.time_zone, o.appUrl)

    for (const e of events) {
      // A changed occurrence of a repeating event; the series is what maps to a task.
      if (e.recurringEventId) continue
      const tid = taskIdOf(e, data) ?? byEvent.get(e.id)
      const task = tid ? data.tasks[tid] : undefined
      if (e.status === 'cancelled') {
        if (!tid || !task || !synced[tid]) continue
        delete synced[tid]
        // Deleted in Google: a task that came from Google goes too; one made in CalmList keeps everything but its date.
        changes.push({ kind: 'tasks', id: tid, data: task.calendarEventId ? null : { ...task, due: null, updatedAt: now } })
        continue
      }
      if (task) {
        // On the first read CalmList is the source of truth; after that, edits made in Google win.
        if (firstRead || task.completed) continue
        const patch = taskPatchFromEvent(e, task, l.time_zone)
        if (!Object.keys(patch).length) continue
        const next = { ...task, ...patch, updatedAt: now }
        data.tasks[tid!] = next
        // Recorded as sent, so the edit isn't written straight back over the event someone just changed.
        synced[tid!] = fingerprint(eventOf(next))
        changes.push({ kind: 'tasks', id: tid!, data: next as unknown as Record<string, unknown> })
      } else if (!tid && inbox) {
        const made = taskFromEvent(e, { id: randomUUID(), projectId: inbox, timeZone: l.time_zone, now })
        if (!made.due) continue
        data.tasks[made.id] = made
        synced[made.id] = fingerprint(eventOf(made))
        changes.push({ kind: 'tasks', id: made.id, data: made as unknown as Record<string, unknown> })
        stamp.push({ event: e.id, task: made.id })
      }
    }
    if (changes.length) writeChanges(db, userId, changes)
    update(userId, { synced: JSON.stringify(synced) })
    // Mark events that became tasks, so they stay linked even after the task is deleted.
    for (const s of stamp)
      await api(userId, `/calendars/${enc(l.calendar_id!)}/events/${s.event}`, {
        method: 'PATCH',
        body: JSON.stringify({ extendedProperties: { private: { calmlist: s.task } } }),
      })
  }

  /* ─── Push channels ───────────────────────────────────────────────────── */

  const stopChannel = (w: Watch) =>
    api(w.user_id, '/channels/stop', { method: 'POST', body: JSON.stringify({ id: w.channel_id, resourceId: w.resource_id }) }).catch(() => null)

  async function watch(userId: string, calendarId: string, existing?: Watch) {
    if (existing && existing.expires_at > Date.now() + 24 * 3600_000) return
    const channel = { id: randomUUID(), token: randomBytes(24).toString('hex') }
    const res = await api<{ resourceId: string; expiration?: string }>(userId, `/calendars/${enc(calendarId)}/events/watch`, {
      method: 'POST',
      body: JSON.stringify({ id: channel.id, type: 'web_hook', address: `${o.publicUrl}/api/google/push`, token: channel.token, params: { ttl: String(WATCH_TTL) } }),
    })
    if (!res?.resourceId) return
    db.prepare(`INSERT INTO google_watches (user_id, calendar_id, channel_id, resource_id, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, calendar_id) DO UPDATE SET channel_id = excluded.channel_id, resource_id = excluded.resource_id,
                token = excluded.token, expires_at = excluded.expires_at`)
      .run(userId, calendarId, channel.id, res.resourceId, channel.token, Number(res.expiration ?? Date.now() + WATCH_TTL * 1000))
    if (existing) await stopChannel(existing)
  }

  /** Watches the CalmList calendar and the person's visible calendars; renews channels before they lapse. */
  async function refreshWatches(userId: string) {
    const l = link(userId)!
    const list = await api<{ items?: CalendarEntry[] }>(userId, '/users/me/calendarList')
    const wanted = [
      ...new Set([l.calendar_id, ...(list?.items ?? []).filter((c) => !c.hidden && c.selected !== false).map((c) => c.id)].filter(Boolean) as string[]),
    ].slice(0, MAX_WATCHED)
    const current = new Map(watches(userId).map((w) => [w.calendar_id, w]))
    for (const id of wanted) await watch(userId, id, current.get(id)).catch((e) => console.error(`Google watch ${id}:`, (e as Error).message))
    for (const [id, w] of current) {
      if (wanted.includes(id)) continue
      await stopChannel(w)
      db.prepare('DELETE FROM google_watches WHERE user_id = ? AND calendar_id = ?').run(userId, id)
    }
  }

  /* ─── Scheduling ──────────────────────────────────────────────────────── */

  const done = (userId: string) => () => {
    if (link(userId)) update(userId, { last_sync: Date.now(), error: null })
  }
  const failed = (userId: string) => (e: unknown) => {
    const message = (e as Error).message
    console.error(`Google sync for ${userId}:`, message)
    if (link(userId)) update(userId, { error: message })
    notify(userId, 'google')
  }

  const reconcile = (userId: string) =>
    serial(userId, async () => {
      if (!link(userId)) return
      await ensureCalendar(userId)
      await pullCalendar(userId)
      await pushTasks(userId)
      await refreshWatches(userId)
    }).then(done(userId), failed(userId))

  const schedule = (userId: string, what: 'pull' | 'push', delay: number) => {
    const k = `${userId}:${what}`
    clearTimeout(timers.get(k))
    timers.set(
      k,
      setTimeout(() => {
        timers.delete(k)
        void serial(userId, () => (what === 'pull' ? pullCalendar(userId) : pushTasks(userId))).then(done(userId), failed(userId))
      }, delay),
    )
  }

  // Task edits from any device reach Google a moment later.
  const unsubscribe = onWrite((userId, changes) => {
    if (changes.some((c) => c.kind === 'tasks' || c.kind === 'projects') && link(userId)) schedule(userId, 'push', 2000)
  })

  /* ─── What the API exposes ────────────────────────────────────────────── */

  const status = (userId: string) => {
    const l = link(userId)
    return l ? { connected: true, email: l.email, lastSync: l.last_sync, error: l.error } : { connected: false }
  }

  return {
    status,

    /** Finishes "Connect Google Calendar": swaps the one-time code for tokens, then syncs. */
    async connect(userId: string, code: string, timeZone: string) {
      const { ok, body } = await oauth({ grant_type: 'authorization_code', code, redirect_uri: 'postmessage' })
      if (!ok) throw new GoogleError(`Google sign-in failed (${body.error_description ?? body.error ?? 'no answer'}).`)
      const granted = String(body.scope ?? '').split(' ')
      if (!granted.includes(SCOPE_OWN) || !granted.includes(SCOPE_READ))
        throw new GoogleError('CalmList needs both calendar permissions. Connect again and leave both boxes ticked.')
      if (!body.refresh_token)
        throw new GoogleError('Google didn’t send a lasting sign-in. Remove CalmList at myaccount.google.com/permissions, then connect again.')
      db.prepare(`INSERT INTO google_links (user_id, email, refresh_token, time_zone, created_at) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token,
                  time_zone = excluded.time_zone, error = NULL`)
        .run(userId, emailOf(String(body.id_token ?? '')), seal(key, String(body.refresh_token)), validZone(timeZone), Date.now())
      tokens.set(userId, { value: String(body.access_token), expires: Date.now() + (Number(body.expires_in ?? 3600) - 60) * 1000 })
      await reconcile(userId)
      return status(userId)
    },

    /** Stops syncing, revokes CalmList's access, and optionally deletes the CalmList calendar. Tasks stay. */
    async disconnect(userId: string, deleteCalendar: boolean) {
      const l = link(userId)
      if (!l) return
      await serial(userId, async () => {
        for (const w of watches(userId)) await stopChannel(w)
        if (deleteCalendar && l.calendar_id) await api(userId, `/calendars/${enc(l.calendar_id)}`, { method: 'DELETE' }).catch(() => null)
        await http('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: unseal(key, l.refresh_token) }),
        }).catch(() => null)
      }).catch(() => {})
      for (const table of ['google_watches', 'google_dismissed', 'google_links']) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
      tokens.delete(userId)
    },

    sync: (userId: string) => (link(userId) ? reconcile(userId).then(() => status(userId)) : Promise.resolve(status(userId))),

    /** Events from the person's other calendars between two times, for the calendar and for picking. */
    async upcoming(userId: string, range: { from: Date; to: Date }) {
      const l = link(userId)
      if (!l) throw new GoogleError('Google Calendar isn’t connected.', 409)
      const list = await api<{ items?: CalendarEntry[] }>(userId, '/users/me/calendarList')
      const calendars = (list?.items ?? []).filter((c) => c.id !== l.calendar_id && !c.hidden && c.selected !== false)
      const data = loadData(db, userId)
      const picked = new Map(Object.values(data.tasks).filter((t) => t.imported).map((t) => [`${t.imported!.calendarId}|${t.imported!.eventId}`, t.id]))
      const dismissed = new Set((db.prepare('SELECT event_key FROM google_dismissed WHERE user_id = ?').all(userId) as { event_key: string }[]).map((r) => r.event_key))
      const q = new URLSearchParams({
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      })
      const lists = await Promise.all(
        calendars.map(async (c) => {
          const page = await api<{ items?: GoogleEvent[] }>(userId, `/calendars/${enc(c.id)}/events?${q}`).catch(() => null)
          return (page?.items ?? [])
            .filter((e) => e.status !== 'cancelled')
            .map((e): PickableEvent => {
              const k = `${c.id}|${e.id}`
              return {
                key: k,
                calendarId: c.id,
                calendar: c.summaryOverride ?? c.summary ?? '',
                color: c.backgroundColor ?? null,
                title: e.summary?.trim() || '(No title)',
                start: e.start,
                end: e.end,
                allDay: !!e.start?.date,
                link: e.htmlLink ?? null,
                taskId: picked.get(k) ?? null,
                dismissed: dismissed.has(k),
              }
            })
        }),
      )
      const at = (e: PickableEvent) => Date.parse(e.start?.dateTime ?? `${e.start?.date}T00:00:00`)
      return { timeZone: l.time_zone, events: lists.flat().sort((a, b) => at(a) - at(b)) }
    },

    /** Makes a task from an event in another calendar. Picking the same event twice returns the same task. */
    async pick(userId: string, eventKey: string) {
      const l = link(userId)
      if (!l) throw new GoogleError('Google Calendar isn’t connected.', 409)
      const cut = eventKey.lastIndexOf('|')
      const [calendarId, id] = [eventKey.slice(0, cut), eventKey.slice(cut + 1)]
      const data = loadData(db, userId)
      const existing = Object.values(data.tasks).find((t) => t.imported?.calendarId === calendarId && t.imported.eventId === id)
      if (existing) return existing.id
      const inbox = inboxOf(data)
      if (!inbox) throw new GoogleError('Open CalmList once on this account first, so it has an Inbox.', 409)
      const e = await api<GoogleEvent>(userId, `/calendars/${enc(calendarId)}/events/${enc(id)}`)
      if (!e || e.status === 'cancelled') throw new GoogleError('That event no longer exists.', 404)
      const task = taskFromEvent(e, { id: randomUUID(), projectId: inbox, timeZone: l.time_zone, now: Date.now(), pickedFrom: calendarId })
      writeChanges(db, userId, [{ kind: 'tasks', id: task.id, data: task as unknown as Record<string, unknown> }])
      db.prepare('DELETE FROM google_dismissed WHERE user_id = ? AND event_key = ?').run(userId, eventKey)
      return task.id
    },

    dismiss(userId: string, eventKey: string, undo: boolean) {
      if (undo) db.prepare('DELETE FROM google_dismissed WHERE user_id = ? AND event_key = ?').run(userId, eventKey)
      else db.prepare('INSERT OR IGNORE INTO google_dismissed (user_id, event_key) VALUES (?, ?)').run(userId, eventKey)
    },

    /** A push notification from Google. Returns false for channels CalmList doesn't know. */
    onPush(headers: Headers) {
      const w = db.prepare('SELECT * FROM google_watches WHERE channel_id = ?').get(headers.get('x-goog-channel-id') ?? '') as Watch | undefined
      if (!w || w.token !== headers.get('x-goog-channel-token')) return false
      if (headers.get('x-goog-resource-state') === 'sync') return true
      if (w.calendar_id === link(w.user_id)?.calendar_id) schedule(w.user_id, 'pull', 1000)
      else notify(w.user_id, 'google')
      return true
    },

    /** Stops listening for writes and cancels pending syncs. */
    close() {
      unsubscribe()
      timers.forEach(clearTimeout)
    },

    /** Catches up every connection now, then every 10 minutes. */
    start() {
      const all = () => {
        const ids = (db.prepare('SELECT user_id FROM google_links').all() as { user_id: string }[]).map((r) => r.user_id)
        ids.forEach((id, i) => setTimeout(() => void reconcile(id), i * 2000).unref())
      }
      setTimeout(all, 5000).unref()
      const timer = setInterval(all, POLL)
      timer.unref()
      return () => (clearInterval(timer), unsubscribe(), timers.forEach(clearTimeout))
    },
  }
}
