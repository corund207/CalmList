import { create } from 'zustand'
import { emptyData, type Data } from '../lib/types'
import { applyChanges, CloudBackend, LocalBackend, type Backend, type Change, type SyncStatus } from './backend'
import { usePrefs } from './prefs'
import { seed } from './seed'

interface Store {
  data: Data
  ready: boolean
  status: SyncStatus
  backend: Backend
  /** Applies changes and returns their inverse, for undo. */
  commit(changes: Change[]): Change[]
}

export const useStore = create<Store>()((set, get) => ({
  data: emptyData(),
  ready: false,
  status: 'local',
  backend: new LocalBackend(),
  commit(changes) {
    if (!changes.length) return []
    const prev = get().data
    const inverse = changes
      .map(({ kind, id }) => ({ kind, id, data: (prev[kind] as Record<string, never>)[id] ?? null }))
      .reverse()
    const data = applyChanges(prev, changes)
    set({ data })
    get().backend.push(changes, data)
    return inverse
  },
}))

export const commit = (changes: Change[]) => useStore.getState().commit(changes)

let stop: (() => void) | undefined

/** Picks the backend from the saved session, loads data and starts syncing. */
export const boot = async () => {
  stop?.()
  const { session, apiUrl } = usePrefs.getState()
  const backend: Backend = session ? new CloudBackend(apiUrl, session.token, session.user.id) : new LocalBackend()
  useStore.setState({ backend, ready: false, status: session ? 'syncing' : 'local' })
  const data = await backend.load()
  useStore.setState({ data, ready: true })
  if (!session) seed()
  stop = backend.start?.(
    (changes) => useStore.setState((s) => ({ data: applyChanges(s.data, changes) })),
    (status) => useStore.setState({ status }),
  )
  if (session) setTimeout(seed, 1500) // create an Inbox only once the server has had a chance to send one
}
