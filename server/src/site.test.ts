import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { openDb } from './db.ts'
import { cacheControl, createSite } from './site.ts'

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'calmlist-site-'))
  mkdirSync(join(dir, 'app/assets'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<h1>landing</h1>')
  writeFileSync(join(dir, 'app/index.html'), '<div id="root"></div>')
  writeFileSync(join(dir, 'app/assets/index-abc.js'), 'export {}')
  const seen: string[] = []
  const mcp = { POST: async (req: Request) => (seen.push(new URL(req.url).searchParams.get('token') ?? req.headers.get('authorization') ?? ''), Response.json({ ok: true })) }
  return { seen, site: createSite({ db: openDb(':memory:'), staticRoot: relative(process.cwd(), dir), endpoints: { mcp } }) }
}

test('serves the landing page and the app with security headers', async () => {
  const { site } = setup()
  const home = await site.request('/')
  assert.equal(home.status, 200)
  assert.match(await home.text(), /landing/)
  assert.match(home.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  assert.equal(home.headers.get('cache-control'), 'no-cache, no-transform')

  const redirect = await site.request('/app')
  assert.equal(redirect.status, 301)
  assert.equal(redirect.headers.get('location'), '/app/')
  assert.match(await (await site.request('/app/')).text(), /root/)
  assert.equal((await site.request('/app/assets/index-abc.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal((await site.request('/nope.html')).status, 404)
})

test('endpoints run before the sync API asks for a sign-in', async () => {
  const { site, seen } = setup()
  assert.equal((await site.request('/api/mcp', { method: 'POST', headers: { authorization: 'Bearer abc' }, body: '{}' })).status, 200)
  assert.equal((await site.request('/api/mcp/tok123', { method: 'POST', body: '{}' })).status, 200)
  assert.deepEqual(seen, ['Bearer abc', 'tok123'])
  assert.equal((await site.request('/api/mcp', { method: 'GET' })).status, 405)

  const sync = await site.request('/api/sync')
  assert.equal(sync.status, 401)
  assert.equal(sync.headers.get('cache-control'), null)
  assert.equal((await site.request('/api/health')).status, 200)
})

test('cache rules', () => {
  assert.equal(cacheControl('/app/sw.js'), 'no-cache, no-transform')
  assert.equal(cacheControl('/app/manifest.webmanifest'), 'no-cache, no-transform')
  assert.equal(cacheControl('/app/icons/icon-192.png'), 'public, max-age=3600')
})
