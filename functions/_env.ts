// Shared by the Vercel functions. Files starting with "_" are helpers, not endpoints.

export const env = {
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, ''),
  anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  /** Only the status check and the stats endpoint use this; the MCP endpoint never does. */
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Calls a Postgres function through Supabase's REST API. */
export async function rpc<T>(fn: string, args: Record<string, unknown>, key = env.anonKey): Promise<T> {
  if (!env.supabaseUrl || !key) throw new HttpError(503, 'This deployment has no Supabase project configured.')
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? `Supabase responded ${res.status}`
    throw new HttpError(/invalid token/.test(message) ? 401 : res.status >= 500 ? 502 : 400, message)
  }
  return body as T
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
