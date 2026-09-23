import { create } from 'zustand'
import { emptyData, type Data } from '../lib/types'
import { applyChanges, LocalBackend, type Backend, type Change, type SyncStatus } from './backend'
import { usePrefs } from './prefs'
import { createBackend } from './providers'
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
let run = 0

/** Picks the backend from the saved session, loads data and starts syncing. */
export const boot = async () => {
  stop?.()
  const id = ++run
  const { session, provider } = usePrefs.getState()
  const backend: Backend = await createBackend(provider, session)
  if (id !== run) return
  useStore.setState({ backend, ready: false, status: session ? 'syncing' : 'local' })
  const data = await backend.load()
  if (id !== run) return // a newer boot superseded this one
  useStore.setState({ data, ready: true })
  if (!session) seed()
  stop = backend.start?.(
    (changes) => useStore.setState((s) => ({ data: applyChanges(s.data, changes) })),
    (status) => useStore.setState({ status }),
  )
  if (session) {
    await backend.firstSync // create an Inbox only once the server has had a chance to send one
    if (id === run) seed()
  }
}
