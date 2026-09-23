#!/usr/bin/env node
// Sets up a self-hosted Supabase for CalmList: fetches Supabase's official Docker
// setup, generates every secret and API key, starts the stack and applies the
// CalmList schema. Re-running reuses the existing secrets.
//
//   npm run supabase:selfhost -- [--dir supabase-selfhost] [--url http://localhost:8000]
//                                [--app-url https://you.github.io/CalmList/app/] [--no-start] [--smtp]

import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migration = join(root, 'supabase', 'migrations', '20260923000000_calmlist.sql')

/* ─── Arguments ─────────────────────────────────────────────────────────── */

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
if (flag('help')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}
const dir = resolve(opt('dir', join(root, 'supabase-selfhost')))
const publicUrl = opt('url', 'http://localhost:8000').replace(/\/+$/, '')
const appUrl = opt('app-url', 'http://localhost:5173')
const start = !flag('no-start')

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const say = (msg) => console.log(`\x1b[36m›\x1b[0m ${msg}`)
const die = (msg) => {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`)
  process.exit(1)
}
const run = (cmd, argv, options = {}) => spawnSync(cmd, argv, { stdio: 'inherit', ...options })
const has = (cmd, argv) => spawnSync(cmd, argv, { stdio: 'ignore' }).status === 0

const secret = (bytes = 32) => randomBytes(bytes).toString('base64url')
const alnum = (length) => randomBytes(length * 2).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, length)
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** A long-lived HS256 JWT for one of Supabase's API roles. */
export const signJwt = (role, jwtSecret, years = 10) => {
  const iat = Math.floor(Date.now() / 1000)
  const body = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role, iss: 'supabase', iat, exp: iat + years * 365 * 86400 })}`
  return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`
}

const parseEnv = (text) => Object.fromEntries(text.split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

/** Rewrites values in an env file while keeping its comments and order. */
const setEnv = (text, values) => {
  const seen = new Set()
  const out = text.split('\n').map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1]
    if (!key || !(key in values)) return line
    seen.add(key)
    return `${key}=${values[key]}`
  })
  const extra = Object.keys(values).filter((k) => !seen.has(k))
  return [...out, ...(extra.length ? ['', '# Added by CalmList', ...extra.map((k) => `${k}=${values[k]}`)] : [])].join('\n')
}

/* ─── 1. Fetch Supabase's Docker setup ─────────────────────────────────── */

if (start && !has('docker', ['compose', 'version'])) die('Docker with the compose plugin is required. Install Docker Desktop or Docker Engine, then re-run.')

if (!existsSync(join(dir, 'docker-compose.yml'))) {
  if (!has('git', ['--version'])) die('git is required to fetch the Supabase Docker files.')
  say(`Fetching Supabase's official Docker setup into ${dir}`)
  const tmp = mkdtempSync(join(tmpdir(), 'supabase-'))
  const ref = opt('ref', 'master')
  if (run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', ref, 'https://github.com/supabase/supabase', tmp]).status) die('git clone failed.')
  if (run('git', ['-C', tmp, 'sparse-checkout', 'set', 'docker']).status) die('git sparse-checkout failed.')
  cpSync(join(tmp, 'docker'), dir, { recursive: true })
  rmSync(tmp, { recursive: true, force: true })
} else say(`Using the existing Supabase files in ${dir}`)

/* ─── 2. Secrets and settings ──────────────────────────────────────────── */

const envPath = join(dir, '.env')
const reuse = existsSync(envPath)
const template = readFileSync(reuse ? envPath : join(dir, '.env.example'), 'utf8')
const current = parseEnv(template)

const values = reuse
  ? {}
  : (() => {
      const jwtSecret = alnum(48)
      return {
        POSTGRES_PASSWORD: alnum(32),
        JWT_SECRET: jwtSecret,
        ANON_KEY: signJwt('anon', jwtSecret),
        SERVICE_ROLE_KEY: signJwt('service_role', jwtSecret),
        DASHBOARD_USERNAME: 'calmlist',
        DASHBOARD_PASSWORD: alnum(24),
        SECRET_KEY_BASE: alnum(64),
        VAULT_ENC_KEY: alnum(32),
        ...(current.PG_META_CRYPTO_KEY !== undefined && { PG_META_CRYPTO_KEY: alnum(32) }),
        ...(current.LOGFLARE_PUBLIC_ACCESS_TOKEN !== undefined && { LOGFLARE_PUBLIC_ACCESS_TOKEN: secret() }),
        ...(current.LOGFLARE_PRIVATE_ACCESS_TOKEN !== undefined && { LOGFLARE_PRIVATE_ACCESS_TOKEN: secret() }),
        ...(current.LOGFLARE_API_KEY !== undefined && { LOGFLARE_API_KEY: secret() }),
        ...(current.REALTIME_DB_ENC_KEY !== undefined && { REALTIME_DB_ENC_KEY: alnum(16) }),
        ...(current.S3_PROTOCOL_ACCESS_KEY_ID !== undefined && { S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString('hex') }),
        ...(current.S3_PROTOCOL_ACCESS_KEY_SECRET !== undefined && { S3_PROTOCOL_ACCESS_KEY_SECRET: randomBytes(32).toString('hex') }),
        ...(current.MINIO_ROOT_PASSWORD !== undefined && { MINIO_ROOT_PASSWORD: alnum(24) }),
      }
    })()

Object.assign(values, {
  SITE_URL: appUrl,
  ADDITIONAL_REDIRECT_URLS: appUrl,
  API_EXTERNAL_URL: publicUrl,
  SUPABASE_PUBLIC_URL: publicUrl,
  // Without SMTP, confirmation emails can't be sent, so accounts are confirmed on sign-up.
  ENABLE_EMAIL_AUTOCONFIRM: flag('smtp') ? 'false' : 'true',
  STUDIO_DEFAULT_PROJECT: 'CalmList',
})

writeFileSync(envPath, setEnv(template, values))
const env = parseEnv(readFileSync(envPath, 'utf8'))
say(reuse ? 'Kept existing secrets in .env' : 'Generated secrets and API keys in .env (keep this file private)')

/* ─── 3. Start and apply the schema ────────────────────────────────────── */

const compose = (...argv) => run('docker', ['compose', ...argv], { cwd: dir })
const psql = (sql, stdio = 'ignore') =>
  spawnSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { cwd: dir, stdio })

if (start) {
  say('Pulling images and starting Supabase (the first run downloads a few GB)')
  if (compose('pull').status) die('docker compose pull failed.')
  if (compose('up', '-d').status) die('docker compose up failed.')

  say('Waiting for the database and auth schema')
  let ready = false
  for (let i = 0; i < 90 && !ready; i++) {
    ready = psql('select 1 from auth.users limit 1').status === 0
    if (!ready) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)'])
  }
  if (!ready) die('The database did not become ready. Check `docker compose ps` and `docker compose logs db` in ' + dir)

  say('Applying the CalmList schema')
  const applied = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    cwd: dir,
    input: readFileSync(migration),
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (applied.status) die('Applying the schema failed. See the error above.')
}

/* ─── 4. Hand-off ──────────────────────────────────────────────────────── */

console.log(`
\x1b[1mSupabase for CalmList is ${start ? 'running' : 'configured'}.\x1b[0m

  API / project URL   ${publicUrl}
  Anon public key     ${env.ANON_KEY}
  Studio              ${publicUrl}   (user ${env.DASHBOARD_USERNAME}, password in ${envPath})

In CalmList open Settings → Sync → Supabase, paste the URL and anon key, then create an account.
${start ? '' : `\nStart it later with:  cd "${dir}" && docker compose up -d\nThen apply the schema: docker compose exec -T db psql -U postgres -d postgres < "${migration}"\n`}
Put HTTPS in front of port 8000 (Caddy, nginx, Cloudflare Tunnel) before using it over the internet,
and re-run with --url https://your-domain so auth links point at it.
`)
