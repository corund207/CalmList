import { emptyData, KINDS, type Data, type Entity, type ID, type Kind } from '../lib/types'

export interface Change {
  kind: Kind
  id: ID
  data: Entity | null // null deletes
}

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error'

export interface Backend {
  load(): Promise<Data>
  push(changes: Change[], data: Data): void
  /** Starts background sync; returns a stop function. */
  start?(onRemote: (changes: Change[]) => void, onStatus: (s: SyncStatus) => void): () => void
}

const read = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: data stays in memory */
  }
}

const normalize = (data: Partial<Data> | null): Data => ({ ...emptyData(), ...data })

export const applyChanges = (data: Data, changes: Change[]): Data => {
  const next = { ...data }
  const touched = new Set<Kind>()
  for (const { kind, id, data: entity } of changes) {
    if (!touched.has(kind)) {
      next[kind] = { ...next[kind] } as never
      touched.add(kind)
    }
    const bucket = next[kind] as Record<ID, Entity>
    if (entity) bucket[id] = entity
    else delete bucket[id]
  }
  return next
}

/** Everything in this browser's localStorage. */
export class LocalBackend implements Backend {
  private key = 'calmlist:data'
  private timer?: ReturnType<typeof setTimeout>

  async load() {
    return normalize(read<Data>(this.key))
  }

  push(_: Change[], data: Data) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => write(this.key, data), 150)
  }
}

interface CloudCache {
  data: Data
  rev: number
  outbox: Change[]
}

/**
 * Talks to the CalmList sync service. Keeps an offline cache and an outbox so
 * edits made without a connection are sent when it returns.
 */
export class CloudBackend implements Backend {
  private cache: CloudCache
  private key: string
  private flushing = false

  constructor(
    private api: string,
    private token: string,
    userId: string,
  ) {
    this.key = `calmlist:cloud:${userId}`
    const cached = read<CloudCache>(this.key)
    this.cache = { data: normalize(cached?.data ?? null), rev: cached?.rev ?? 0, outbox: cached?.outbox ?? [] }
  }

  async load() {
    return this.cache.data
  }

  push(changes: Change[], data: Data) {
    const pending = new Map(this.cache.outbox.map((c) => [`${c.kind}:${c.id}`, c]))
    for (const c of changes) pending.set(`${c.kind}:${c.id}`, c)
    this.cache = { ...this.cache, data, outbox: [...pending.values()] }
    this.save()
    void this.flush()
  }

  start(onRemote: (changes: Change[]) => void, onStatus: (s: SyncStatus) => void) {
    this.onRemote = onRemote
    this.onStatus = onStatus
    const tick = () => void this.sync()
    tick()
    const interval = setInterval(tick, 20_000)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }

  private onRemote: (changes: Change[]) => void = () => {}
  private onStatus: (s: SyncStatus) => void = () => {}

  private save() {
    write(this.key, this.cache)
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.api}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
    })
    if (res.status === 401) window.dispatchEvent(new Event('calmlist:unauthorized'))
    if (!res.ok) throw new Error(`${res.status}`)
    return res.json() as Promise<T>
  }

  private async flush() {
    if (this.flushing || !this.cache.outbox.length) return
    this.flushing = true
    try {
      // Edits made mid-request replace their outbox entry, so they survive the filter and go next round.
      while (this.cache.outbox.length) {
        this.onStatus('syncing')
        const sent = new Set(this.cache.outbox)
        await this.request('/api/sync', { method: 'POST', body: JSON.stringify({ changes: [...sent] }) })
        this.cache.outbox = this.cache.outbox.filter((c) => !sent.has(c))
        this.save()
      }
      this.onStatus('synced')
    } catch {
      this.onStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      this.flushing = false
    }
  }

  private async sync() {
    await this.flush()
    try {
      const { rev, changes } = await this.request<{ rev: number; changes: Change[] }>(`/api/sync?since=${this.cache.rev}`)
      const pending = new Set(this.cache.outbox.map((c) => `${c.kind}:${c.id}`))
      const incoming = changes.filter((c) => KINDS.includes(c.kind) && !pending.has(`${c.kind}:${c.id}`))
      this.cache = { ...this.cache, rev, data: applyChanges(this.cache.data, incoming) }
      this.save()
      if (incoming.length) this.onRemote(incoming)
      if (!this.cache.outbox.length) this.onStatus('synced')
    } catch {
      this.onStatus(navigator.onLine ? 'error' : 'offline')
    }
  }
}
