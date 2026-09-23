import { describe, expect, it } from 'vitest'
import { handleRpc, zonedNow, type AgentChange, type AgentStore } from './mcp'

const T0 = Date.now()
const base = { createdAt: T0, updatedAt: T0 }

const memoryStore = (items: AgentChange[], timezone = 'UTC') => {
  const rows = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]))
  const writes: AgentChange[][] = []
  const store: AgentStore = {
    read: async () => ({ timezone, items: [...rows.values()] }),
    write: async (changes) => {
      writes.push(changes)
      for (const c of changes) rows.set(`${c.kind}:${c.id}`, c)
    },
  }
  const get = (kind: string, id: string) => rows.get(`${kind}:${id}`)?.data as Record<string, unknown> | null | undefined
  const all = (kind: string) => [...rows.values()].filter((r) => r.kind === kind && r.data).map((r) => r.data as Record<string, unknown>)
  return { store, writes, get, all }
}

const seed = () => {
  const today = new Date().toISOString().slice(0, 10)
  return memoryStore([
    { kind: 'projects', id: 'inbox', data: { ...base, id: 'inbox', name: 'Inbox', inbox: true, order: 0, view: 'list' } },
    { kind: 'projects', id: 'work', data: { ...base, id: 'work', name: 'Work', order: 1, view: 'list' } },
    { kind: 'labels', id: 'l1', data: { ...base, id: 'l1', name: 'calls', order: 0 } },
    { kind: 'tasks', id: 't1', data: { ...base, id: 't1', content: 'Send invoice', description: '', projectId: 'work', sectionId: null, parentId: null, order: 0, priority: 1, due: { date: today }, labels: [], completed: false, completedAt: null } },
    { kind: 'tasks', id: 't2', data: { ...base, id: 't2', content: 'Water plants', description: '', projectId: 'inbox', sectionId: null, parentId: null, order: 1, priority: 4, due: { date: today, recurrence: { every: 1, unit: 'week' } }, labels: [], completed: false, completedAt: null } },
    { kind: 'tasks', id: 't3', data: { ...base, id: 't3', content: 'Someday idea', description: '', projectId: 'inbox', sectionId: null, parentId: null, order: 2, priority: 4, due: null, labels: [], completed: false, completedAt: null } },
  ])
}

const opts = { appUrl: 'https://calmlist.test/app/' }
let seq = 0
const call = (store: AgentStore, name: string, args: Record<string, unknown> = {}) =>
  handleRpc({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } }, store, opts) as Promise<{
    result: { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError: boolean }
  }>

describe('MCP protocol', () => {
  it('negotiates the protocol and lists tools', async () => {
    const { store } = seed()
    const init = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, store, opts)) as { result: { protocolVersion: string } }
    expect(init.result.protocolVersion).toBe('2025-03-26')
    const list = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, store, opts)) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['list_tasks', 'add_task', 'complete_task', 'search', 'fetch']))
  })

  it('ignores notifications and rejects unknown methods', async () => {
    const { store } = seed()
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, store, opts)).toBeNull()
    expect(await handleRpc({ jsonrpc: '2.0', id: 3, method: 'nope' }, store, opts)).toMatchObject({ error: { code: -32601 } })
  })
})

describe('MCP tools', () => {
  it('lists today and overdue by default, most urgent first', async () => {
    const { store } = seed()
    const res = await call(store, 'list_tasks')
    expect((res.result.structuredContent!.tasks as { content: string }[]).map((t) => t.content)).toEqual(['Send invoice', 'Water plants'])
  })

  it('adds a task from Quick Add syntax, creating missing labels, marked as AI-made', async () => {
    const { store, all } = seed()
    const res = await call(store, 'add_task', { content: 'Call the bank tomorrow 3pm #Work @calls @urgent p2' })
    expect(res.result.isError).toBe(false)
    const task = all('tasks').find((t) => t.content === 'Call the bank')!
    expect(task).toMatchObject({ projectId: 'work', priority: 2, ai: true, due: { time: '15:00' } })
    expect(all('labels').map((l) => l.name).sort()).toEqual(['calls', 'urgent'])
  })

  it('completes a recurring task by moving it to the next date', async () => {
    const { store, get, all } = seed()
    const before = (get('tasks', 't2')!.due as { date: string }).date
    await call(store, 'complete_task', { id: 't2' })
    const after = get('tasks', 't2')!
    expect(after.completed).toBe(false)
    expect((after.due as { date: string }).date > before).toBe(true)
    expect(all('events')).toHaveLength(1)
  })

  it('updates, completes and deletes', async () => {
    const { store, get } = seed()
    await call(store, 'update_task', { id: 't3', due_date: '2030-01-02', due_time: '09:30', priority: 'p3', project: 'Work' })
    expect(get('tasks', 't3')).toMatchObject({ due: { date: '2030-01-02', time: '09:30' }, priority: 3, projectId: 'work' })
    await call(store, 'complete_task', { id: 't1' })
    expect(get('tasks', 't1')!.completed).toBe(true)
    await call(store, 'delete_task', { id: 't3' })
    expect(get('tasks', 't3')).toBeNull()
  })

  it('reports bad input as a tool error, without writing', async () => {
    const { store, writes } = seed()
    const res = await call(store, 'update_task', { id: 'missing' })
    expect(res.result.isError).toBe(true)
    expect((await call(store, 'list_tasks', { filter: '(' })).result.isError).toBe(true)
    expect(writes).toHaveLength(0)
  })

  it('supports ChatGPT-style search and fetch', async () => {
    const { store } = seed()
    const found = await call(store, 'search', { query: 'invoice' })
    const results = found.result.structuredContent!.results as { id: string; url: string }[]
    expect(results).toEqual([{ id: 't1', title: 'Send invoice', url: 'https://calmlist.test/app/#/task/t1' }])
    const doc = await call(store, 'fetch', { id: 't1' })
    expect(doc.result.structuredContent).toMatchObject({ id: 't1', title: 'Send invoice' })
  })
})

describe('zonedNow', () => {
  it('reads the wall clock in the given timezone', () => {
    const at = new Date('2026-01-01T23:30:00Z')
    expect(zonedNow('Asia/Tokyo', at).getDate()).toBe(2)
    expect(zonedNow('America/New_York', at).getHours()).toBe(18)
    expect(zonedNow('Not/AZone', at).getHours()).toBe(zonedNow('UTC', at).getHours())
  })
})
