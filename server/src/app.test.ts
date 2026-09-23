import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const setup = () => {
  const app = createApp({ db: openDb(':memory:') })
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, json: (await res.json()) as any }
  }
  return call
}

test('signup, login and me', async () => {
  const call = setup()
  const signup = await call('POST', '/api/auth/signup', { email: 'Ada@Example.com', password: 'correct horse', name: 'Ada' })
  assert.equal(signup.status, 201)
  assert.equal(signup.json.user.email, 'ada@example.com')

  assert.equal((await call('POST', '/api/auth/signup', { email: 'ada@example.com', password: 'another one' })).status, 409)
  assert.equal((await call('POST', '/api/auth/login', { email: 'ada@example.com', password: 'wrong pass' })).status, 401)

  const login = await call('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' })
  assert.equal(login.status, 200)
  const me = await call('GET', '/api/me', undefined, login.json.token)
  assert.equal(me.json.user.name, 'Ada')

  await call('POST', '/api/auth/logout', undefined, login.json.token)
  assert.equal((await call('GET', '/api/me', undefined, login.json.token)).status, 401)
})

test('rejects weak signups and anonymous sync', async () => {
  const call = setup()
  assert.equal((await call('POST', '/api/auth/signup', { email: 'nope', password: 'correct horse' })).status, 400)
  assert.equal((await call('POST', '/api/auth/signup', { email: 'a@b.co', password: 'short' })).status, 400)
  assert.equal((await call('GET', '/api/sync')).status, 401)
})

test('sync pushes, pulls incrementally and keeps users apart', async () => {
  const call = setup()
  const a = (await call('POST', '/api/auth/signup', { email: 'a@x.io', password: 'password-a' })).json.token
  const b = (await call('POST', '/api/auth/signup', { email: 'b@x.io', password: 'password-b' })).json.token

  const task = { id: 't1', content: 'Write tests' }
  const push = await call('POST', '/api/sync', { changes: [{ kind: 'tasks', id: 't1', data: task }, { kind: 'projects', id: 'p1', data: { id: 'p1', name: 'Work' } }] }, a)
  assert.equal(push.json.rev, 2)

  const all = await call('GET', '/api/sync?since=0', undefined, a)
  assert.equal(all.json.changes.length, 2)

  await call('POST', '/api/sync', { changes: [{ kind: 'tasks', id: 't1', data: null }] }, a)
  const delta = await call('GET', '/api/sync?since=2', undefined, a)
  assert.deepEqual(delta.json.changes, [{ kind: 'tasks', id: 't1', data: null }])

  assert.equal((await call('GET', '/api/sync?since=0', undefined, b)).json.changes.length, 0)

  const exported = await call('GET', '/api/export', undefined, a)
  assert.deepEqual(Object.keys(exported.json.projects), ['p1'])
  assert.deepEqual(exported.json.tasks, {})
})

test('validates change batches', async () => {
  const call = setup()
  const t = (await call('POST', '/api/auth/signup', { email: 'v@x.io', password: 'password-v' })).json.token
  const bad = [
    { changes: [{ kind: 'secrets', id: 'x', data: { id: 'x' } }] },
    { changes: [{ kind: 'tasks', id: 'x', data: { id: 'y' } }] },
    { changes: 'nope' },
  ]
  for (const body of bad) assert.equal((await call('POST', '/api/sync', body, t)).status, 400)
})
