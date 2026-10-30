// A user's records, and the one place they are written: the sync API and the Google Calendar sync both
// go through writeChanges, so every write gets a revision and reaches the person's open devices.
import { emptyData, type Data } from '../../web/src/lib/types.ts'
import { tx, type DB } from './db.ts'

export const KINDS = new Set(['projects', 'sections', 'labels', 'filters', 'tasks', 'comments', 'events'])

export interface Change {
  kind: string
  id: string
  data: Record<string, unknown> | null
}

type Listener = (userId: string, changes: Change[]) => void
const listeners = new Set<Listener>()

/** Called after every committed write, with the changes it made. */
export const onWrite = (fn: Listener) => (listeners.add(fn), () => void listeners.delete(fn))

/** Last write wins: each change gets the next revision number for this user. */
export function writeChanges(db: DB, userId: string, changes: Change[]): number {
  const rev = tx(db, () => {
    const upsert = db.prepare(`INSERT INTO items (user_id, kind, id, data, rev) VALUES (?, ?, ?, ?, ?)
                               ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, rev = excluded.rev`)
    let { rev } = db.prepare('SELECT rev FROM users WHERE id = ?').get(userId) as { rev: number }
    for (const ch of changes) upsert.run(userId, ch.kind, ch.id, ch.data ? JSON.stringify(ch.data) : null, ++rev)
    db.prepare('UPDATE users SET rev = ? WHERE id = ?').run(rev, userId)
    return rev
  })
  for (const fn of listeners) {
    try {
      fn(userId, changes)
    } catch (e) {
      console.error(e)
    }
  }
  return rev
}

/** Everything the user owns, shaped like the app's data. */
export function loadData(db: DB, userId: string): Data {
  const data = emptyData()
  const rows = db.prepare('SELECT kind, data FROM items WHERE user_id = ? AND data IS NOT NULL').all(userId) as { kind: string; data: string }[]
  for (const r of rows) {
    if (!KINDS.has(r.kind)) continue
    const doc = JSON.parse(r.data)
    ;(data[r.kind as keyof Data] as Record<string, unknown>)[doc.id] = doc
  }
  return data
}
