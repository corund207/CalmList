// Builds the deployable site: the landing page at the root, the app at /app/, and third-party
// license notices in _site/, plus the MCP, stats and status-check endpoints bundled into _functions/
// for the CalmList server to mount at /api/<name>. The Dockerfile runs this.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'rolldown'

const OUT = '_site'
const FUNCTIONS = '_functions'
const env = {
  ...process.env,
  BASE: process.env.BASE ?? './',
  VITE_POLICY_URL: process.env.VITE_POLICY_URL ?? '../legal.html',
  // The MCP endpoint is served by the same server.
  VITE_MCP_URL: process.env.VITE_MCP_URL ?? '/api/mcp',
}

rmSync(OUT, { recursive: true, force: true })
execSync(`npm run build --workspace web -- --outDir ../${OUT}/app --emptyOutDir`, { stdio: 'inherit', env })
cpSync('site', OUT, { recursive: true })
writeFileSync(join(OUT, 'licenses.txt'), notices())

rmSync(FUNCTIONS, { recursive: true, force: true })
for (const name of ['mcp', 'stats', 'status-check']) {
  await build({ input: resolve('functions', `${name}.ts`), platform: 'node', logLevel: 'warn', output: { file: join(FUNCTIONS, `${name}.mjs`), format: 'esm' } })
}
console.log(`Built ${OUT}/ (app at /app/) and ${FUNCTIONS}/`)

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
