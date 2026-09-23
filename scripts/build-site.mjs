// Builds the deployable site: the landing page at the root, the app at /app/, and third-party
// license notices. Used by GitHub Pages (pages.yml) and Vercel (vercel.json). On Vercel it also
// writes the Build Output API layout: static files, pre-bundled functions, headers and cron.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'rolldown'

const OUT = '_site'
const vercel = !!process.env.VERCEL
const env = {
  ...process.env,
  BASE: process.env.BASE ?? './',
  VITE_POLICY_URL: process.env.VITE_POLICY_URL ?? '../legal.html',
  // On Vercel the MCP endpoint is part of the same deployment.
  VITE_MCP_URL: process.env.VITE_MCP_URL ?? (vercel ? '/api/mcp' : ''),
}

rmSync(OUT, { recursive: true, force: true })
execSync(`npm run build --workspace web -- --outDir ../${OUT}/app --emptyOutDir`, { stdio: 'inherit', env })
cpSync('site', OUT, { recursive: true })
writeFileSync(join(OUT, 'licenses.txt'), notices())
if (vercel || process.argv.includes('--vercel')) await vercelOutput()
console.log(`Built ${OUT}/ (app at /app/${vercel ? ', plus .vercel/output with the MCP endpoint' : ''})`)

/* ─── Vercel Build Output API (v3) ──────────────────────────────────────── */

async function vercelOutput() {
  const root = '.vercel/output'
  rmSync(root, { recursive: true, force: true })
  cpSync(OUT, join(root, 'static'), { recursive: true })

  for (const name of ['mcp', 'stats', 'status-check']) {
    const dir = join(root, 'functions/api', `${name}.func`)
    mkdirSync(dir, { recursive: true })
    const entry = join('.vercel', `entry-${name}.ts`)
    writeFileSync(entry, `import * as mod from '../functions/${name}.ts'
import { toNode } from '../functions/_node.ts'
export default toNode(mod)
`)
    await build({ input: resolve(entry), platform: 'node', logLevel: 'warn', output: { file: join(dir, 'index.js'), format: 'cjs', exports: 'default' } })
    rmSync(entry)
    writeFileSync(join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2))
  }

  const security = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
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
      'frame-src https://accounts.google.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  }
  const config = {
    version: 3,
    routes: [
      { src: '/(.*)', headers: security, continue: true },
      { src: '/app/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/api/mcp/([^/]+)/?$', dest: '/api/mcp?token=$1' },
      { handle: 'filesystem' },
    ],
    crons: [{ path: '/api/status-check', schedule: '0 12 * * *' }],
  }
  writeFileSync(join(root, 'config.json'), JSON.stringify(config, null, 2))
}

/** Every production dependency with its license text. Dev-only tools and native binaries for other platforms are left out. */
function notices() {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  const seen = new Set()
  const parts = []
  for (const [path, meta] of Object.entries(lock.packages)) {
    if (!path || meta.dev || meta.link || (meta.optional && (meta.os || meta.cpu))) continue
    if (!path.includes('node_modules/')) continue
    const dir = path
    const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {}
    const name = pkg.name ?? path.split('node_modules/').pop()
    const id = `${name}@${meta.version}`
    if (seen.has(id)) continue
    seen.add(id)
    const license = meta.license ?? pkg.license ?? 'SEE PACKAGE'
    const file = existsSync(dir) && readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(f))
    const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `Licensed under ${license}. See ${pkg.homepage ?? pkg.repository?.url ?? `https://www.npmjs.com/package/${name}`}.`
    parts.push(`${'='.repeat(78)}\n${id}  (${license})\n${'='.repeat(78)}\n${text}\n`)
  }
  parts.sort()
  return `CalmList third-party notices
Generated ${new Date().toISOString().slice(0, 10)} from package-lock.json. CalmList itself is MIT licensed:
https://github.com/corund207/CalmList/blob/main/LICENSE

Models you choose to download for on-device AI (for example from Hugging Face) come with their
own licenses, shown on each model's page. They are not part of this distribution.

${parts.join('\n')}`
}
