// Probes the service and records the result for the uptime numbers. Run by Vercel Cron and GitHub Actions.
import { env, json } from './_env'

const probe = async (url: string, headers: Record<string, string> = {}) => {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    return { ok: res.status < 500, latency_ms: Date.now() - started }
  } catch {
    return { ok: false, latency_ms: null }
  }
}

export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) return json({ error: 'unauthorized' }, 401)
  if (!env.supabaseUrl || !env.serviceKey) return json({ error: 'Supabase is not configured' }, 503)
  const key = { apikey: env.anonKey }
  const results = {
    api: await probe(`${env.supabaseUrl}/rest/v1/`, key),
    auth: await probe(`${env.supabaseUrl}/auth/v1/health`, key),
    app: await probe(`${new URL(req.url).origin}/app/`),
  }
  const rows = Object.entries(results).map(([component, r]) => ({ component, ...r }))
  const headers = { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, 'content-type': 'application/json' }
  const saved = await fetch(`${env.supabaseUrl}/rest/v1/calmlist_status_checks`, { method: 'POST', headers, body: JSON.stringify(rows) })
  await fetch(`${env.supabaseUrl}/rest/v1/rpc/calmlist_prune_status`, { method: 'POST', headers, body: '{}' }).catch(() => {})
  return json({ saved: saved.ok, results }, saved.ok ? 200 : 502)
}
