import { usePrefs } from './prefs'
import { supabaseClient } from './providers'

export interface AgentToken {
  id: string
  name: string
  hint: string
  created_at: string
  last_used_at: string | null
}

const client = async () => {
  const { provider, session } = usePrefs.getState()
  if (provider.kind !== 'supabase' || !session) throw new Error('Sign in with Supabase sync to connect AI assistants.')
  return supabaseClient(provider.url, provider.anonKey)
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function listTokens(): Promise<AgentToken[]> {
  const { data, error } = await (await client()).from('calmlist_api_tokens').select('id, name, hint, created_at, last_used_at').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Makes a new token for an assistant. Only its SHA-256 hash is stored; the token itself is
 * returned once, here, and never again.
 */
export async function createToken(name: string): Promise<string> {
  const random = crypto.getRandomValues(new Uint8Array(32))
  const token = `cl_${btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  const token_hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const { error } = await (await client()).from('calmlist_api_tokens').insert({ name: name.trim().slice(0, 60), token_hash, hint: token.slice(-4), timezone })
  if (error) throw new Error(error.message)
  return token
}

export async function revokeToken(id: string) {
  const { error } = await (await client()).from('calmlist_api_tokens').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
