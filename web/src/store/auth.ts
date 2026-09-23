import type { Data } from '../lib/types'
import { importData } from './actions'
import { LocalBackend } from './backend'
import { usePrefs, type Session } from './prefs'
import { boot, useStore } from './store'

export const apiBase = (url: string) => url.trim().replace(/\/+$/, '')

async function post<T>(api: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(`Can't reach ${api || 'the server'}. Check the address and that the server allows this site (CORS_ORIGIN).`)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Server responded ${res.status}`)
  return json as T
}

/** Local data lifted into an account: its Inbox merges into the account's Inbox. */
const mergeLocal = (local: Data) => {
  const data = useStore.getState().data
  const cloudInbox = Object.values(data.projects).find((p) => p.inbox)
  const localInbox = Object.values(local.projects).find((p) => p.inbox)
  if (cloudInbox && localInbox && cloudInbox.id !== localInbox.id) {
    delete local.projects[localInbox.id]
    for (const t of Object.values(local.tasks)) if (t.projectId === localInbox.id) t.projectId = cloudInbox.id
    for (const e of Object.values(local.events)) if (e.projectId === localInbox.id) e.projectId = cloudInbox.id
  }
  importData(local)
}

export async function authenticate(mode: 'login' | 'signup', apiUrl: string, fields: { email: string; password: string; name?: string }, bringLocal: boolean) {
  const api = apiBase(apiUrl)
  const session = await post<Session>(api, `/api/auth/${mode}`, fields)
  const local = bringLocal ? await new LocalBackend().load() : null
  usePrefs.getState().set({ session, apiUrl: api })
  await boot()
  if (local && Object.keys(local.tasks).length) mergeLocal(local)
}

export async function signOut() {
  const { session, apiUrl } = usePrefs.getState()
  if (session) post(apiUrl, '/api/auth/logout', undefined, session.token).catch(() => {})
  if (session) localStorage.removeItem(`calmlist:cloud:${session.user.id}`)
  usePrefs.getState().set({ session: null })
  await boot()
}

// A revoked or expired token signs the device out rather than failing silently.
if (typeof window !== 'undefined') window.addEventListener('calmlist:unauthorized', () => void signOut())
