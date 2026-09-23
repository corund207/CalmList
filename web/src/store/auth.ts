import type { Data } from '../lib/types'
import { importData } from './actions'
import { LocalBackend } from './backend'
import { usePrefs } from './prefs'
import { signIn, signOutOf, type Credentials, type ProviderConfig } from './providers'
import { boot, useStore } from './store'

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

export async function authenticate(provider: ProviderConfig, mode: 'login' | 'signup', creds: Credentials, bringLocal: boolean) {
  const session = await signIn(provider, mode, creds)
  const local = bringLocal ? await new LocalBackend().load() : null
  usePrefs.getState().set({ session, provider })
  await boot()
  if (local && Object.keys(local.tasks).length) mergeLocal(local)
}

export async function signOut() {
  const { session, provider } = usePrefs.getState()
  if (session) {
    await signOutOf(provider, session)
    localStorage.removeItem(`calmlist:cloud:${provider.kind}:${session.user.id}`)
  }
  usePrefs.getState().set({ session: null, provider: { kind: 'local' } })
  await boot()
}

// A revoked or expired session signs the device out rather than failing silently.
if (typeof window !== 'undefined') window.addEventListener('calmlist:unauthorized', () => void signOut())
