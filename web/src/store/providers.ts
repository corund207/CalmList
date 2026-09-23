import type { SupabaseClient } from '@supabase/supabase-js'
import { LocalBackend, RemoteBackend, Unauthorized, type Backend, type Change, type Transport } from './backend'
import type { Session } from './prefs'

/** Where a device keeps and syncs its data. */
export type ProviderConfig =
  | { kind: 'local' }
  | { kind: 'calmlist'; url: string }
  | { kind: 'supabase'; url: string; anonKey: string }

export type RemoteKind = Exclude<ProviderConfig['kind'], 'local'>

export const PROVIDER_NAMES: Record<ProviderConfig['kind'], string> = {
  local: 'This device',
  calmlist: 'CalmList server',
  supabase: 'Supabase',
}

/** Build-time defaults, so a deployment can ship pointed at its own backend. */
export const PRESETS = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  calmlistUrl: import.meta.env.VITE_API_URL ?? '',
  /** Where this deployment's Terms and Privacy Policy live; sign-up links to it when set. */
  policyUrl: import.meta.env.VITE_POLICY_URL ?? '',
  /** The MCP endpoint for AI assistants (a Vercel deployment of this repo); relative paths resolve against this site. */
  mcpUrl: import.meta.env.VITE_MCP_URL ? new URL(import.meta.env.VITE_MCP_URL, location.origin).href : '',
  /** An OAuth web client id from Google Cloud, for the Google Calendar connector. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
}

export const SUPABASE_TABLE = 'calmlist_items'

const trimUrl = (url: string) => url.trim().replace(/\/+$/, '')

/* ─── CalmList server ───────────────────────────────────────────────────── */

async function call<T>(base: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${trimUrl(base)}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.token && { authorization: `Bearer ${init.token}` }) },
    })
  } catch {
    throw new Error(`Can't reach ${base || 'the server'}. Check the address and that the server allows this site (CORS_ORIGIN).`)
  }
  if (res.status === 401 && init.token) throw new Unauthorized()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Server responded ${res.status}`)
  return json as T
}

const calmlistTransport = (url: string, token: string): Transport => ({
  pull: (since) => call(url, `/api/sync?since=${since}`, { token }),
  push: async (changes) => void (await call(url, '/api/sync', { method: 'POST', body: JSON.stringify({ changes }), token })),
})

/* ─── Supabase (hosted or self-hosted) ──────────────────────────────────── */

const clients = new Map<string, Promise<SupabaseClient>>()

/** One client per project, loaded on demand so local-only users never download it. */
export const supabaseClient = (url: string, anonKey: string) => {
  const key = `${trimUrl(url)}|${anonKey}`
  if (!clients.has(key))
    clients.set(key, import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(trimUrl(url), anonKey, {
        // PKCE puts ?code= in the query string, which leaves the hash router's #/path alone.
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'calmlist:supabase-auth', flowType: 'pkce', detectSessionInUrl: false },
      })))
  return clients.get(key)!
}

const PAGE = 1000

const supabaseTransport = (client: SupabaseClient, userId: string): Transport => ({
  async pull(since) {
    const changes: Change[] = []
    let rev = since
    for (;;) {
      const { data, error, status } = await client.from(SUPABASE_TABLE).select('kind, id, data, rev').gt('rev', rev).order('rev').limit(PAGE)
      if (status === 401 || error?.code === 'PGRST301') throw new Unauthorized()
      if (error) throw new Error(error.message)
      for (const row of data) changes.push({ kind: row.kind, id: row.id, data: row.data })
      if (data.length) rev = data[data.length - 1].rev
      if (data.length < PAGE) return { rev, changes }
    }
  },
  async push(changes) {
    const rows = changes.map((c) => ({ user_id: userId, kind: c.kind, id: c.id, data: c.data }))
    for (let i = 0; i < rows.length; i += PAGE) {
      const { error, status } = await client.from(SUPABASE_TABLE).upsert(rows.slice(i, i + PAGE), { onConflict: 'user_id,kind,id' })
      if (status === 401) throw new Unauthorized()
      if (error) throw new Error(error.message)
    }
  },
  subscribe(poke) {
    const channel = client
      .channel(`calmlist:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: SUPABASE_TABLE, filter: `user_id=eq.${userId}` }, poke)
      .subscribe()
    return () => void client.removeChannel(channel)
  },
})

/* ─── Factory ───────────────────────────────────────────────────────────── */

export const createBackend = async (provider: ProviderConfig, session: Session | null): Promise<Backend> => {
  if (provider.kind === 'local' || !session) return new LocalBackend()
  const cacheKey = `calmlist:cloud:${provider.kind}:${session.user.id}`
  if (provider.kind === 'calmlist') return new RemoteBackend(calmlistTransport(provider.url, session.token), cacheKey)
  const client = await supabaseClient(provider.url, provider.anonKey)
  return new RemoteBackend(supabaseTransport(client, session.user.id), cacheKey)
}

/* ─── Accounts ──────────────────────────────────────────────────────────── */

export interface Credentials {
  email: string
  password: string
  name?: string
}

/** Bumped when the Terms or Privacy Policy change materially; stored with each sign-up. */
export const POLICY_VERSION = '2026-09-23'

/** This app's address without any route, for email links. */
export const appUrl = () => `${location.origin}${location.pathname}`

export async function signIn(provider: ProviderConfig, mode: 'login' | 'signup', creds: Credentials): Promise<Session> {
  if (provider.kind === 'calmlist') return call<Session>(provider.url, `/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(creds) })
  if (provider.kind !== 'supabase') throw new Error('Pick a sync service first.')

  const client = await supabaseClient(provider.url, provider.anonKey)
  const result = mode === 'signup'
    ? await client.auth.signUp({
        email: creds.email,
        password: creds.password,
        options: {
          emailRedirectTo: `${appUrl()}?auth=confirm`,
          // A record of what the person agreed to, kept with their account (GDPR art. 7(1)).
          data: { name: creds.name, terms_version: POLICY_VERSION, terms_accepted_at: new Date().toISOString(), age_confirmed: true },
        },
      })
    : await client.auth.signInWithPassword({ email: creds.email, password: creds.password })
  if (result.error) throw new Error(result.error.message)
  const { session, user } = result.data
  if (!session || !user) throw new Error('Check your inbox to confirm your email, then sign in.')
  return {
    token: session.access_token,
    user: { id: user.id, email: user.email ?? creds.email, name: (user.user_metadata?.name as string) || creds.email.split('@')[0] },
  }
}

export async function signOutOf(provider: ProviderConfig, session: Session) {
  if (provider.kind === 'calmlist') await call(provider.url, '/api/auth/logout', { method: 'POST', token: session.token }).catch(() => {})
  if (provider.kind === 'supabase') await (await supabaseClient(provider.url, provider.anonKey)).auth.signOut().catch(() => {})
}

/** Checks that a provider is reachable and set up, with a hint when it is not. */
export async function testConnection(provider: ProviderConfig): Promise<string> {
  if (provider.kind === 'calmlist') {
    await call(provider.url, '/api/health')
    return 'CalmList server is reachable.'
  }
  if (provider.kind !== 'supabase') return 'Nothing to test for local storage.'
  if (!/^https?:\/\//.test(provider.url) || !provider.anonKey) throw new Error('Enter the project URL and its anon (public) key.')
  const client = await supabaseClient(provider.url, provider.anonKey)
  // Signed out, a set-up table answers "permission denied" (42501): row-level security doing its job.
  const { error } = await client.from(SUPABASE_TABLE).select('id').limit(0)
  if (!error || error.code === '42501') return 'Supabase project is reachable and set up. Sign in or create an account.'
  if (error.code === 'PGRST205' || error.code === '42P01')
    throw new Error(`Connected, but the ${SUPABASE_TABLE} table is missing. Run the setup SQL in the project's SQL editor.`)
  if (/api key/i.test(error.message)) throw new Error('Supabase rejected that key. Copy the anon public key from Project Settings → API.')
  throw new Error(error.message || `Supabase responded with an error.`)
}
