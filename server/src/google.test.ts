import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Task } from '../../web/src/lib/types.ts'
import { createUser } from './auth.ts'
import { openDb } from './db.ts'
import { createGoogle } from './google.ts'
import { loadData, writeChanges } from './items.ts'

/* ─── A small in-memory Google Calendar, with incremental sync ──────────── */

type Ev = Record<string, unknown> & { id: string; status?: string; updated: number }

function fakeGoogle() {
  let clock = 0
  const calendars = new Map<string, { summary: string; owner: boolean; events: Map<string, Ev> }>()
  calendars.set('primary@example.com', { summary: 'Jonah', owner: true, events: new Map() })
  const log: { method: string; path: string }[] = []
  let refreshOk = true
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const touch = (e: Ev) => ((e.updated = ++clock), e)

  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const body = init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(String(init.body)))) : {}
    log.push({ method, path: url.pathname + url.search })
    if (url.hostname === 'oauth2.googleapis.com') {
      if (url.pathname === '/revoke') return json({})
      if (body.grant_type === 'authorization_code')
        return json({
          access_token: 'at-1',
          expires_in: 3600,
          refresh_token: 'rt-secret',
          scope: 'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.readonly',
          id_token: `x.${Buffer.from(JSON.stringify({ email: 'jonah@example.com' })).toString('base64url')}.y`,
        })
      return refreshOk ? json({ access_token: 'at-2', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400)
    }
    // After revoking, Google rejects the access token too.
    if (!refreshOk) return json({ error: { message: 'Invalid Credentials' } }, 401)
    const path = decodeURIComponent(url.pathname.replace('/calendar/v3', ''))
    let m: RegExpMatchArray | null
    if (path === '/users/me/calendarList')
      return json({ items: [...calendars].filter(([, c]) => c.owner || url.searchParams.get('minAccessRole') !== 'owner').map(([id, c]) => ({ id, summary: c.summary })) })
    if (path === '/calendars' && method === 'POST') {
      const id = `cal${calendars.size}@group.calendar.google.com`
      calendars.set(id, { summary: body.summary, owner: true, events: new Map() })
      return json({ id })
    }
    if (path === '/channels/stop') return new Response(null, { status: 204 })
    if ((m = path.match(/^\/calendars\/([^/]+)$/))) return calendars.has(m[1]) ? json({ id: m[1] }) : json({}, 404)
    if ((m = path.match(/^\/calendars\/([^/]+)\/events\/watch$/))) return json({ resourceId: `res-${m[1]}`, expiration: String(Date.now() + 7 * 86_400_000) })
    if ((m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/))) {
      const cal = calendars.get(m[1])
      if (!cal) return json({}, 404)
      const id = m[2]
      if (!id && method === 'GET') {
        const since = url.searchParams.get('syncToken')
        const prop = url.searchParams.get('privateExtendedProperty')
        let items = [...cal.events.values()]
        if (prop) items = items.filter((e) => (e.extendedProperties as { private?: Record<string, string> })?.private?.calmlist === prop.split('=')[1] && e.status !== 'cancelled')
        else items = since ? items.filter((e) => e.updated > Number(since)) : items.filter((e) => e.status !== 'cancelled')
        return json({ items, nextSyncToken: String(clock) })
      }
      if (!id && method === 'POST') {
        if (cal.events.has(body.id)) return json({}, 409)
        cal.events.set(body.id, touch({ ...body, status: 'confirmed', updated: 0 }))
        return json(cal.events.get(body.id))
      }
      const e = cal.events.get(id!)
      if (method === 'GET') return e && e.status !== 'cancelled' ? json(e) : json({}, 404)
      if (method === 'PUT') return e ? json(Object.assign(e, body, touch(e))) : json({}, 404)
      if (method === 'PATCH') return e ? json(Object.assign(e, { ...body, extendedProperties: body.extendedProperties }, touch(e))) : json({}, 404)
      if (method === 'DELETE') {
        if (!e || e.status === 'cancelled') return json({}, 410)
        cal.events.set(id!, touch({ id: id!, status: 'cancelled', updated: 0 }))
        return new Response(null, { status: 204 })
      }
    }
    return json({ error: { message: `fake: ${method} ${path}` } }, 500)
  }

  return {
    fetch: fetch as typeof globalThis.fetch,
    calendars,
    log,
    revoke: () => (refreshOk = false),
    /** Someone adds or edits an event in Google Calendar. */
    put: (calendarId: string, e: { id: string } & Record<string, unknown>) => calendars.get(calendarId)!.events.set(e.id, touch({ ...e, updated: 0 } as Ev)),
    remove: (calendarId: string, id: string) => calendars.get(calendarId)!.events.set(id, touch({ id, status: 'cancelled', updated: 0 })),
    calmlist: () => [...calendars].find(([, c]) => c.summary === 'CalmList')!,
  }
}

const project = { id: 'inbox', createdAt: 0, updatedAt: 0, name: 'Inbox', order: 0, inbox: true, view: 'list' }
const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id, createdAt: 0, updatedAt: 0, content: `Task ${id}`, description: '', projectId: 'inbox', sectionId: null, parentId: null,
  order: 0, priority: 4, due: null, labels: [], completed: false, completedAt: null, ...patch,
})

const setup = async () => {
  const db = openDb(':memory:')
  const user = createUser(db, 'jonah@example.com', 'Jonah', 'correct horse')
  writeChanges(db, user.id, [
    { kind: 'projects', id: 'inbox', data: project },
    { kind: 'tasks', id: 'dentist', data: task('dentist', { content: 'Call the dentist', due: { date: '2026-11-02', time: '15:00' } }) as never },
    { kind: 'tasks', id: 'undated', data: task('undated') as never },
  ])
  const g = fakeGoogle()
  const google = createGoogle({ db, clientId: 'cid', clientSecret: 'secret', tokenKey: 'ab'.repeat(32), publicUrl: 'https://calmlist.test', appUrl: 'https://calmlist.test/app/', fetch: g.fetch })
  const status = await google.connect(user.id, 'code-1', 'America/New_York')
  const tasks = () => loadData(db, user.id).tasks
  return { db, user, g, google, status, tasks }
}

test('connecting makes the CalmList calendar, sends dated tasks and watches calendars', async () => {
  const { db, user, g, google, status } = await setup()
  assert.deepEqual(status, { connected: true, email: 'jonah@example.com', lastSync: (status as { lastSync: number }).lastSync, error: null })
  const [, cal] = g.calmlist()
  const events = [...cal.events.values()]
  assert.equal(events.length, 1)
  assert.equal(events[0].summary, 'Call the dentist')
  assert.deepEqual(events[0].start, { dateTime: '2026-11-02T15:00:00', timeZone: 'America/New_York' })
  // The refresh token is never stored in the clear.
  const stored = db.prepare('SELECT refresh_token FROM google_links').get() as { refresh_token: string }
  assert.ok(!stored.refresh_token.includes('rt-secret'))
  const watched = (db.prepare('SELECT calendar_id FROM google_watches WHERE user_id = ?').all(user.id) as { calendar_id: string }[]).map((r) => r.calendar_id).sort()
  assert.deepEqual(watched, [g.calmlist()[0], 'primary@example.com'].sort())
  google.close()
})

test('events added or edited in the CalmList calendar become or change tasks, without echoing back', async () => {
  const { g, google, user, tasks } = await setup()
  const [calId, cal] = g.calmlist()
  g.put(calId, { id: 'gym1', summary: 'Gym', start: { dateTime: '2026-11-03T07:30:00-05:00' }, end: { dateTime: '2026-11-03T08:30:00-05:00' } })
  await google.sync(user.id)
  const gym = Object.values(tasks()).find((t) => t.content === 'Gym')!
  assert.deepEqual(gym.due, { date: '2026-11-03', time: '07:30' })
  assert.equal(gym.calendarEventId, 'gym1')
  assert.equal((cal.events.get('gym1')!.extendedProperties as { private: { calmlist: string } }).private.calmlist, gym.id)
  // Google's own end time is kept: the new task isn't written back over the event.
  assert.deepEqual(cal.events.get('gym1')!.end, { dateTime: '2026-11-03T08:30:00-05:00' })

  // Moved in Google: the task follows, and nothing is sent back.
  const dentistEvent = [...cal.events.values()].find((e) => e.summary === 'Call the dentist')!
  g.put(calId, { ...dentistEvent, summary: 'Call the dentist (moved)', start: { dateTime: '2026-11-04T16:00:00-05:00' } })
  const before = g.log.length
  await google.sync(user.id)
  assert.equal(tasks().dentist.content, 'Call the dentist (moved)')
  assert.deepEqual(tasks().dentist.due, { date: '2026-11-04', time: '16:00' })
  assert.ok(!g.log.slice(before).some((r) => r.method === 'PUT'), 'no write-back')
  google.close()
})

test('task edits in CalmList reach Google, and finished tasks leave the calendar', async () => {
  const { db, g, google, user } = await setup()
  const [, cal] = g.calmlist()
  writeChanges(db, user.id, [{ kind: 'tasks', id: 'undated', data: task('undated', { content: 'Pay rent', due: { date: '2026-11-05' } }) as never }])
  await google.sync(user.id)
  assert.ok([...cal.events.values()].some((e) => e.summary === 'Pay rent' && (e.start as { date: string }).date === '2026-11-05'))
  writeChanges(db, user.id, [{ kind: 'tasks', id: 'undated', data: task('undated', { content: 'Pay rent', due: { date: '2026-11-05' }, completed: true, completedAt: 1 }) as never }])
  await google.sync(user.id)
  assert.ok(![...cal.events.values()].some((e) => e.summary === 'Pay rent' && e.status !== 'cancelled'))
  google.close()
})

test('deleting an event in Google: a task from Google goes, a CalmList task keeps everything but its date', async () => {
  const { g, google, user, tasks } = await setup()
  const [calId, cal] = g.calmlist()
  g.put(calId, { id: 'party1', summary: 'Party', start: { date: '2026-11-07' }, end: { date: '2026-11-08' } })
  await google.sync(user.id)
  const party = Object.values(tasks()).find((t) => t.content === 'Party')!
  g.remove(calId, 'party1')
  const dentistId = [...cal.events.values()].find((e) => e.summary === 'Call the dentist')!.id
  g.remove(calId, dentistId)
  await google.sync(user.id)
  assert.equal(tasks()[party.id], undefined)
  assert.equal(tasks().dentist.content, 'Call the dentist')
  assert.equal(tasks().dentist.due, null)
  google.close()
})

test('events from other calendars can be picked or dismissed, and picked ones are not copied back', async () => {
  const { g, google, user, tasks } = await setup()
  const soon = new Date(Date.now() + 86_400_000).toISOString()
  g.put('primary@example.com', { id: 'flight', summary: 'Flight to Denver', start: { dateTime: soon }, end: { dateTime: soon } })
  g.put('primary@example.com', { id: 'lunch', summary: 'Lunch', start: { dateTime: soon }, end: { dateTime: soon } })
  const range = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 30 * 86_400_000) }
  let list = await google.upcoming(user.id, range)
  assert.deepEqual(list.events.map((e) => e.title).sort(), ['Flight to Denver', 'Lunch'])
  const flight = list.events.find((e) => e.title === 'Flight to Denver')!
  const taskId = await google.pick(user.id, flight.key)
  assert.equal(await google.pick(user.id, flight.key), taskId, 'picking twice gives the same task')
  assert.deepEqual(tasks()[taskId].imported, { calendarId: 'primary@example.com', eventId: 'flight' })
  google.dismiss(user.id, list.events.find((e) => e.title === 'Lunch')!.key, false)
  list = await google.upcoming(user.id, range)
  assert.equal(list.events.find((e) => e.title === 'Flight to Denver')!.taskId, taskId)
  assert.equal(list.events.find((e) => e.title === 'Lunch')!.dismissed, true)
  await google.sync(user.id)
  assert.ok(![...g.calmlist()[1].events.values()].some((e) => e.summary === 'Flight to Denver'))
  google.close()
})

test('push notifications are only accepted from known channels', async () => {
  const { db, google } = await setup()
  const w = db.prepare('SELECT channel_id, token FROM google_watches LIMIT 1').get() as { channel_id: string; token: string }
  assert.equal(google.onPush(new Headers({ 'x-goog-channel-id': w.channel_id, 'x-goog-channel-token': 'wrong' })), false)
  assert.equal(google.onPush(new Headers({ 'x-goog-channel-id': w.channel_id, 'x-goog-channel-token': w.token, 'x-goog-resource-state': 'sync' })), true)
  google.close()
})

test('revoked access shows up as an error to reconnect', async () => {
  const { g, google, user } = await setup()
  g.revoke()
  const status = await google.sync(user.id)
  assert.equal(status.connected, true)
  assert.equal((status as { error: string | null }).error, 'Google access was removed. Connect again.')
  google.close()
})
