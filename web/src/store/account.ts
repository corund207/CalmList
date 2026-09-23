import { importData } from './actions'
import { usePrefs, type Session } from './prefs'
import { appUrl, PRESETS, PROVIDER_NAMES, supabaseClient, type ProviderConfig } from './providers'
import { boot } from './store'

const supabaseProvider = (): Extract<ProviderConfig, { kind: 'supabase' }> | null => {
  const p = usePrefs.getState().provider
  if (p.kind === 'supabase') return p
  return PRESETS.supabaseUrl && PRESETS.supabaseAnonKey ? { kind: 'supabase', url: PRESETS.supabaseUrl, anonKey: PRESETS.supabaseAnonKey } : null
}

const toSession = (s: { access_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }): Session => ({
  token: s.access_token,
  user: { id: s.user.id, email: s.user.email ?? '', name: (s.user.user_metadata?.name as string) || (s.user.email ?? '').split('@')[0] },
})

/**
 * Finishes an email link (sign-up confirmation or password reset) that landed on ?code=…&auth=….
 * Returns "recovery" when the person should now choose a new password, "expired" when the link no longer works.
 */
export async function handleAuthRedirect(): Promise<'confirm' | 'recovery' | 'expired' | null> {
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  const kind = url.searchParams.get('auth')
  if (!code || !kind) return null
  url.searchParams.delete('code')
  url.searchParams.delete('auth')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
  const provider = supabaseProvider()
  if (!provider) return null
  const client = await supabaseClient(provider.url, provider.anonKey)
  const { data, error } = await client.auth.exchangeCodeForSession(code)
  if (error || !data.session) return 'expired'
  usePrefs.getState().set({ provider, session: toSession(data.session) })
  return kind === 'recovery' ? 'recovery' : 'confirm'
}

export async function requestPasswordReset(email: string) {
  const provider = supabaseProvider()
  if (!provider) throw new Error('Password reset works with Supabase accounts. Ask your CalmList server admin to reset it.')
  const client = await supabaseClient(provider.url, provider.anonKey)
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}?auth=recovery` })
  if (error) throw new Error(error.message)
}

const client = async () => {
  const { provider } = usePrefs.getState()
  if (provider.kind !== 'supabase') throw new Error(`Managing this account happens on your ${PROVIDER_NAMES[provider.kind]}.`)
  return supabaseClient(provider.url, provider.anonKey)
}

export async function updatePassword(password: string) {
  const { error } = await (await client()).auth.updateUser({ password })
  if (error) throw new Error(error.message)
}

export async function updateName(name: string) {
  const { data, error } = await (await client()).auth.updateUser({ data: { name } })
  if (error) throw new Error(error.message)
  const { session } = usePrefs.getState()
  if (session && data.user) usePrefs.getState().set({ session: { ...session, user: { ...session.user, name } } })
}

/** Right to erasure: removes the account and everything stored with it, then returns to this-device mode. */
export async function deleteAccount(keepLocalCopy: boolean) {
  const { provider, session } = usePrefs.getState()
  if (!session) return
  const cacheKey = `calmlist:cloud:${provider.kind}:${session.user.id}`
  const cached = keepLocalCopy ? localStorage.getItem(cacheKey) : null
  if (provider.kind === 'supabase') {
    const c = await supabaseClient(provider.url, provider.anonKey)
    const { error } = await c.rpc('calmlist_delete_account')
    if (error) throw new Error(error.message)
    await c.auth.signOut({ scope: 'local' }).catch(() => {})
  } else if (provider.kind === 'calmlist') {
    const res = await fetch(`${provider.url.replace(/\/+$/, '')}/api/account`, { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` } })
    if (!res.ok) throw new Error(`The server refused (${res.status}).`)
  }
  localStorage.removeItem(cacheKey)
  usePrefs.getState().set({ session: null, provider: { kind: 'local' } })
  await boot()
  if (cached) importData(JSON.parse(cached).data)
}
