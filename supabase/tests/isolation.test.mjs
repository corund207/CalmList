// Runs every migration against an in-memory Postgres (PGlite) with Supabase's auth stubbed,
// then proves that one person can never read or change another person's data.
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const MIGRATIONS = new URL('../migrations/', import.meta.url)
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

async function database() {
  const db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, last_sign_in_at timestamptz);
    create role authenticated; create role anon; create role service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create publication supabase_realtime;
    grant usage on schema public, auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${A}', now()), ('${B}', now() - interval '10 days');
  `)
  // Twice, to prove the migrations are idempotent.
  for (let i = 0; i < 2; i++)
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'))
  const as = async (uid, sql) => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}'`)
    try {
      return await db.query(sql)
    } finally {
      await db.exec('reset role')
    }
  }
  return { db, as }
}

test('people only see their own items', async () => {
  const { as } = await database()
  await as(A, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't1', '{"id":"t1","content":"A secret"}')`)
  await as(B, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't1', '{"id":"t1","content":"B task"}')`)
  const seen = await as(B, `select data->>'content' as c from public.calmlist_items`)
  assert.deepEqual(seen.rows.map((r) => r.c), ['B task'])
})

test('nobody can write into someone else’s account', async () => {
  const { as } = await database()
  await assert.rejects(as(B, `insert into public.calmlist_items (user_id, kind, id, data) values ('${A}', 'tasks', 'x', '{"id":"x"}')`), /row-level security/)
  await as(A, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't1', '{"id":"t1"}')`)
  const updated = await as(B, `update public.calmlist_items set data = '{"id":"t1","pwned":true}' where user_id = '${A}' returning id`)
  assert.equal(updated.rows.length, 0)
  const deleted = await as(B, `delete from public.calmlist_items where user_id = '${A}' returning id`)
  assert.equal(deleted.rows.length, 0)
})

test('each write gets a newer revision', async () => {
  const { as } = await database()
  await as(A, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't1', '{"id":"t1"}')`)
  const first = (await as(A, `select rev from public.calmlist_items`)).rows[0].rev
  await as(A, `update public.calmlist_items set data = '{"id":"t1","v":2}'`)
  const second = (await as(A, `select rev from public.calmlist_items`)).rows[0].rev
  assert.ok(Number(second) > Number(first))
})

test('agent tokens are private and capped', async () => {
  const { as } = await database()
  await assert.rejects(as(B, `insert into public.calmlist_api_tokens (user_id, name, token_hash, hint) values ('${A}', 'x', '${'e'.repeat(64)}', 'x')`), /row-level security/)
  for (let i = 0; i < 20; i++) await as(A, `insert into public.calmlist_api_tokens (name, token_hash, hint) values ('t${i}', '${i.toString(16).padStart(64, '0')}', 'x')`)
  await assert.rejects(as(A, `insert into public.calmlist_api_tokens (name, token_hash, hint) values ('one more', '${'f'.repeat(64)}', 'x')`), /token limit/)
  assert.equal((await as(B, `select count(*)::int n from public.calmlist_api_tokens`)).rows[0].n, 0)
})

test('status data and stats are service-only', async () => {
  const { db, as } = await database()
  await assert.rejects(as(A, `select * from public.calmlist_status_checks`), /permission denied/)
  await assert.rejects(as(A, `select public.calmlist_service_stats()`), /permission denied/)
  await db.exec(`insert into public.calmlist_status_checks (component, ok, latency_ms) values ('api', true, 100), ('api', false, null)`)
  await db.exec('set role service_role')
  const stats = (await db.query('select public.calmlist_service_stats() s')).rows[0].s
  await db.exec('reset role')
  assert.equal(stats.users_total, 2)
  assert.equal(stats.active_1d, 1)
  assert.equal(Number(stats.uptime_24h), 50)
})

test('deleting an account erases everything it owned', async () => {
  const { db, as } = await database()
  await as(A, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't1', '{"id":"t1"}')`)
  await as(A, `insert into public.calmlist_api_tokens (name, token_hash, hint) values ('Claude', '${'a'.repeat(64)}', 'x')`)
  await as(B, `insert into public.calmlist_items (kind, id, data) values ('tasks', 't2', '{"id":"t2"}')`)
  await as(A, `select public.calmlist_delete_account()`)
  const count = async (t, where = '') => (await db.query(`select count(*)::int n from ${t} ${where}`)).rows[0].n
  assert.equal(await count('auth.users', `where id = '${A}'`), 0)
  assert.equal(await count('public.calmlist_items', `where user_id = '${A}'`), 0)
  assert.equal(await count('public.calmlist_api_tokens'), 0)
  assert.equal(await count('public.calmlist_items'), 1)
})

test('an agent token reads and writes only its owner’s data', async () => {
  const { db, as } = await database()
  const token = 'cl_' + 'k'.repeat(40)
  const hash = (await db.query(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') h`, [token])).rows[0].h
  await as(A, `insert into public.calmlist_api_tokens (name, token_hash, hint, timezone) values ('Claude', '${hash}', 'kkkk', 'Europe/Berlin')`)
  await as(A, `insert into public.calmlist_items (kind, id, data) values ('tasks', 'a1', '{"id":"a1","content":"A task"}')`)
  await as(B, `insert into public.calmlist_items (kind, id, data) values ('tasks', 'b1', '{"id":"b1","content":"B secret"}')`)

  const agent = async (sql, params) => {
    await db.exec('set role anon')
    try {
      return (await db.query(sql, params)).rows[0]
    } finally {
      await db.exec('reset role')
    }
  }
  const read = (await agent(`select public.calmlist_agent_read($1) r`, [token])).r
  assert.equal(read.timezone, 'Europe/Berlin')
  assert.deepEqual(read.items.map((i) => i.data.content), ['A task'])

  // Writing an id that B also uses lands in A's account and leaves B's row alone.
  await agent(`select public.calmlist_agent_write($1, $2) n`, [token, JSON.stringify([{ kind: 'tasks', id: 'b1', data: { id: 'b1', content: 'from agent' } }, { kind: 'users', id: 'x', data: {} }])])
  const rows = (await db.query(`select user_id, kind, id, data->>'content' c from public.calmlist_items order by user_id, id`)).rows
  assert.deepEqual(rows.map((r) => [r.user_id, r.id, r.c]), [[A, 'a1', 'A task'], [A, 'b1', 'from agent'], [B, 'b1', 'B secret']])

  await assert.rejects(agent(`select public.calmlist_agent_read($1) r`, ['cl_' + 'x'.repeat(40)]), /invalid token/)
  await assert.rejects(agent(`select public.calmlist_token_user($1)`, [token]), /permission denied/)
  assert.ok((await db.query(`select last_used_at from public.calmlist_api_tokens`)).rows[0].last_used_at)
})
