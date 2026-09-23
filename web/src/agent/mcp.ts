// CalmList as an MCP server: the tools Claude, ChatGPT and other agents call to read and change
// one person's tasks. Pure logic over a small store interface, so it runs on Vercel and in tests alike.
import { toISO } from '../lib/dates'
import { runFilter } from '../lib/filter'
import { uid } from '../lib/id'
import { parseDate, parseQuickAdd } from '../lib/parse'
import { describeRecurrence, nextOccurrence } from '../lib/recurrence'
import { byUrgency, descendants } from '../lib/select'
import { emptyData, type Collections, type Data, type Due, type ID, type Kind, type Priority, type Task } from '../lib/types'

export interface AgentChange {
  kind: Kind
  id: ID
  data: unknown
}

/** One person's data, already scoped by their token. */
export interface AgentStore {
  read(): Promise<{ timezone: string; items: AgentChange[] }>
  write(changes: AgentChange[]): Promise<void>
}

export interface ServerOptions {
  /** The app's address, for task links. */
  appUrl: string
}

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

/* ─── Snapshot ──────────────────────────────────────────────────────────── */

/** The wall-clock time in a timezone, as a Date whose local fields read that time. */
export const zonedNow = (timezone: string, at = new Date()) => {
  try {
    return new Date(at.toLocaleString('en-US', { timeZone: timezone }))
  } catch {
    return new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  }
}

const load = async (store: AgentStore) => {
  const { timezone, items } = await store.read()
  const data = emptyData()
  for (const i of items) if (i.data && i.kind in data) (data[i.kind] as Record<ID, unknown>)[i.id] = i.data
  return { data, now: zonedNow(timezone) }
}

const byName = <T extends { id: ID; name: string }>(items: Record<ID, T>, ref: string) =>
  items[ref] ?? Object.values(items).find((i) => i.name.toLowerCase() === ref.trim().replace(/^[#@]/, '').toLowerCase())

const stamp = () => {
  const t = Date.now()
  return { id: uid(), createdAt: t, updatedAt: t }
}

const inbox = (data: Data) => Object.values(data.projects).find((p) => p.inbox)

/* ─── Shapes agents see ─────────────────────────────────────────────────── */

const describeDue = (due: Due | null) =>
  due ? `${due.date}${due.time ? ` ${due.time}` : ''}${due.recurrence ? ` (${describeRecurrence(due.recurrence)})` : ''}` : null

const view = (t: Task, data: Data, opts: ServerOptions) => ({
  id: t.id,
  content: t.content,
  ...(t.description && { description: t.description }),
  due: describeDue(t.due),
  ...(t.deadline && { deadline: t.deadline }),
  priority: `p${t.priority}`,
  project: data.projects[t.projectId]?.inbox ? 'Inbox' : (data.projects[t.projectId]?.name ?? null),
  ...(t.sectionId && data.sections[t.sectionId] && { section: data.sections[t.sectionId].name }),
  labels: t.labels.map((l) => data.labels[l]?.name).filter(Boolean),
  ...(t.parentId && { parent_id: t.parentId }),
  completed: t.completed,
  url: `${opts.appUrl}#/task/${t.id}`,
})

/* ─── Tools ─────────────────────────────────────────────────────────────── */

type Args = Record<string, unknown>
type Result = { text: string; structured?: Record<string, unknown> }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

class ToolError extends Error {}

const findTask = (data: Data, id: unknown) => {
  const task = typeof id === 'string' ? data.tasks[id] : undefined
  if (!task) throw new ToolError(`No task with id ${String(id)}. Use list_tasks or search to find ids.`)
  return task
}

/** Due from separate fields or a phrase like "tomorrow 5pm" / "every monday". */
const dueFrom = (args: Args, now: Date, current: Due | null): Due | null | undefined => {
  if (args.due === null || args.due_date === null) return null
  const phrase = str(args.due)
  if (phrase) {
    const hit = parseDate(phrase, now)
    if (!hit) throw new ToolError(`Couldn't read the date "${phrase}". Try "tomorrow 5pm", "next friday", "2026-10-01" or "every monday".`)
    return hit.due
  }
  const date = str(args.due_date)
  const time = str(args.due_time)
  if (!date && !time) return undefined
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError('due_date must be YYYY-MM-DD.')
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new ToolError('due_time must be HH:mm (24-hour).')
  const base = date ?? current?.date ?? toISO(now)
  return { ...(current?.date === base ? current : {}), date: base, ...(time && { time }) }
}

const priorityFrom = (v: unknown): Priority | undefined => {
  if (v === undefined || v === null) return undefined
  const n = Number(String(v).replace(/^p/i, ''))
  if (![1, 2, 3, 4].includes(n)) throw new ToolError('priority is 1 (urgent) to 4 (none), or "p1".."p4".')
  return n as Priority
}

interface Ctx {
  data: Data
  now: Date
  changes: AgentChange[]
  opts: ServerOptions
}

const put = <K extends Kind>(ctx: Ctx, kind: K, entity: Collections[K]) => {
  ;(ctx.data[kind] as Record<ID, unknown>)[entity.id] = entity
  ctx.changes.push({ kind, id: entity.id, data: entity })
}

const projectRef = (ctx: Ctx, ref: string | undefined, create: boolean) => {
  if (!ref) return undefined
  if (/^inbox$/i.test(ref)) return inbox(ctx.data)?.id
  const found = byName(ctx.data.projects, ref)
  if (found) return found.id
  if (!create) throw new ToolError(`No project named "${ref}". Use list_projects to see them.`)
  const project = { ...stamp(), name: ref.replace(/^#/, ''), order: Object.keys(ctx.data.projects).length, view: 'list' as const }
  put(ctx, 'projects', project)
  return project.id
}

const labelRefs = (ctx: Ctx, refs: unknown) => {
  if (!Array.isArray(refs)) return undefined
  return refs.filter((r): r is string => typeof r === 'string' && !!r.trim()).map((ref) => {
    const found = byName(ctx.data.labels, ref)
    if (found) return found.id
    const label = { ...stamp(), name: ref.trim().replace(/^@/, ''), order: Object.keys(ctx.data.labels).length }
    put(ctx, 'labels', label)
    return label.id
  })
}

const openTasks = (data: Data) => Object.values(data.tasks).filter((t) => !t.completed && data.projects[t.projectId] && !data.projects[t.projectId].archived)

const listTasks = (ctx: Ctx, args: Args): Result => {
  const { data, now } = ctx
  const filter = str(args.filter) ?? 'today | overdue'
  let tasks: Task[]
  try {
    tasks = /^(all|everything)$/i.test(filter) ? openTasks(data) : runFilter(filter, data, now)
  } catch (e) {
    throw new ToolError(`Filter error: ${(e as Error).message}`)
  }
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
  const sorted = tasks.sort(byUrgency)
  const shown = sorted.slice(0, limit).map((t) => view(t, data, ctx.opts))
  return {
    text: shown.length
      ? `${sorted.length} task${sorted.length === 1 ? '' : 's'} match "${filter}"${sorted.length > limit ? `, showing ${limit}` : ''}:\n${JSON.stringify(shown, null, 1)}`
      : `No open tasks match "${filter}".`,
    structured: { filter, total: sorted.length, tasks: shown },
  }
}

const addTask = (ctx: Ctx, args: Args): Result => {
  const { data, now } = ctx
  const text = str(args.content)
  if (!text) throw new ToolError('content is required.')
  // Quick Add syntax in the content is honoured too: "Call mum tomorrow 6pm #Family @phone p2".
  const parsed = args.parse === false
    ? { content: text, due: null, deadline: null, priority: null, project: null, section: null, labels: [] as string[] }
    : parseQuickAdd(text, { projects: Object.values(data.projects).map((p) => p.name), labels: Object.values(data.labels).map((l) => l.name), now })
  const projectId = projectRef(ctx, str(args.project) ?? parsed.project ?? undefined, true) ?? inbox(data)?.id ?? projectRef(ctx, 'Inbox', true)!
  const parent = str(args.parent_id) ? findTask(data, args.parent_id) : undefined
  const labels = [...new Set([...(labelRefs(ctx, parsed.labels) ?? []), ...(labelRefs(ctx, args.labels) ?? [])])]
  const siblings = Object.values(data.tasks).filter((t) => t.projectId === (parent?.projectId ?? projectId) && t.parentId === (parent?.id ?? null))
  const task: Task = {
    ...stamp(),
    content: parsed.content || text,
    description: str(args.description) ?? '',
    projectId: parent?.projectId ?? projectId,
    sectionId: parent?.sectionId ?? null,
    parentId: parent?.id ?? null,
    order: siblings.reduce((m, t) => Math.max(m, t.order), -1) + 1,
    priority: priorityFrom(args.priority) ?? parsed.priority ?? 4,
    due: dueFrom(args, now, null) ?? parsed.due,
    deadline: parsed.deadline,
    labels,
    completed: false,
    completedAt: null,
    ai: true,
  }
  put(ctx, 'tasks', task)
  const shown = view(task, ctx.data, ctx.opts)
  return { text: `Added: ${JSON.stringify(shown)}`, structured: { task: shown } }
}

const updateTask = (ctx: Ctx, args: Args): Result => {
  const task = findTask(ctx.data, args.id)
  const next: Task = { ...task, updatedAt: Date.now() }
  if (str(args.content)) next.content = str(args.content)!
  if (typeof args.description === 'string') next.description = args.description
  const due = dueFrom(args, ctx.now, task.due)
  if (due !== undefined) next.due = due
  const priority = priorityFrom(args.priority)
  if (priority) next.priority = priority
  const projectId = projectRef(ctx, str(args.project), true)
  if (projectId && projectId !== task.projectId) {
    next.projectId = projectId
    next.sectionId = null
    next.parentId = null
    for (const kid of descendants(ctx.data, task.id)) put(ctx, 'tasks', { ...kid, projectId, sectionId: null, updatedAt: next.updatedAt })
  }
  const labels = labelRefs(ctx, args.labels)
  if (labels) next.labels = labels
  put(ctx, 'tasks', next)
  const shown = view(next, ctx.data, ctx.opts)
  return { text: `Updated: ${JSON.stringify(shown)}`, structured: { task: shown } }
}

/** Mirrors the app: a recurring task moves to its next date, others complete with their subtasks. */
const completeTask = (ctx: Ctx, args: Args): Result => {
  const task = findTask(ctx.data, args.id)
  if (task.completed) return { text: `"${task.content}" is already complete.` }
  const t = Date.now()
  put(ctx, 'events', { ...stamp(), type: 'completed' as const, taskId: task.id, content: task.content, projectId: task.projectId })
  const kids = descendants(ctx.data, task.id)
  if (task.due?.recurrence) {
    const due = nextOccurrence(task.due, ctx.now)
    put(ctx, 'tasks', { ...task, due, updatedAt: t })
    for (const k of kids.filter((k) => k.completed)) put(ctx, 'tasks', { ...k, completed: false, completedAt: null, updatedAt: t })
    return { text: `Completed "${task.content}". It repeats, so it's now due ${describeDue(due)}.` }
  }
  for (const k of [task, ...kids.filter((k) => !k.completed)]) put(ctx, 'tasks', { ...k, completed: true, completedAt: t, updatedAt: t })
  return { text: `Completed "${task.content}"${kids.length ? ` and ${kids.length} subtask${kids.length === 1 ? '' : 's'}` : ''}.` }
}

const reopenTask = (ctx: Ctx, args: Args): Result => {
  const task = findTask(ctx.data, args.id)
  put(ctx, 'tasks', { ...task, completed: false, completedAt: null, updatedAt: Date.now() })
  return { text: `Reopened "${task.content}".` }
}

const deleteTask = (ctx: Ctx, args: Args): Result => {
  const task = findTask(ctx.data, args.id)
  const ids = [task.id, ...descendants(ctx.data, task.id).map((t) => t.id)]
  for (const id of ids) {
    delete ctx.data.tasks[id]
    ctx.changes.push({ kind: 'tasks', id, data: null })
  }
  return { text: `Deleted "${task.content}"${ids.length > 1 ? ` and ${ids.length - 1} subtask${ids.length > 2 ? 's' : ''}` : ''}.` }
}

const listProjects = (ctx: Ctx): Result => {
  const projects = Object.values(ctx.data.projects)
    .filter((p) => !p.archived)
    .sort((a, b) => Number(!!b.inbox) - Number(!!a.inbox) || a.order - b.order)
    .map((p) => ({ id: p.id, name: p.inbox ? 'Inbox' : p.name, open_tasks: openTasks(ctx.data).filter((t) => t.projectId === p.id).length }))
  const labels = Object.values(ctx.data.labels).sort((a, b) => a.order - b.order).map((l) => l.name)
  return { text: JSON.stringify({ projects, labels }, null, 1), structured: { projects, labels } }
}

const addProject = (ctx: Ctx, args: Args): Result => {
  const name = str(args.name)
  if (!name) throw new ToolError('name is required.')
  if (byName(ctx.data.projects, name)) return { text: `Project "${name}" already exists.` }
  const id = projectRef(ctx, name, true)!
  return { text: `Created project "${name}" (${id}).`, structured: { id, name } }
}

/* ChatGPT connectors and deep research look for exactly these two. */
const search = (ctx: Ctx, args: Args): Result => {
  const q = (str(args.query) ?? '').toLowerCase()
  const results = Object.values(ctx.data.tasks)
    .filter((t) => `${t.content}\n${t.description}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || byUrgency(a, b))
    .slice(0, 25)
    .map((t) => ({ id: t.id, title: t.content, url: `${ctx.opts.appUrl}#/task/${t.id}` }))
  return { text: JSON.stringify({ results }), structured: { results } }
}

const fetchTask = (ctx: Ctx, args: Args): Result => {
  const task = findTask(ctx.data, args.id)
  const v = view(task, ctx.data, ctx.opts)
  const doc = { id: task.id, title: task.content, text: [task.content, task.description, v.due && `Due: ${v.due}`].filter(Boolean).join('\n\n'), url: v.url, metadata: v }
  return { text: JSON.stringify(doc), structured: doc }
}

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly?: boolean
  destructive?: boolean
  run(ctx: Ctx, args: Args): Result
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const S = (description: string) => ({ type: 'string', description })
const DUE = {
  due: S('When it is due, in plain words: "tomorrow 5pm", "next friday", "every monday", "2026-10-01". Use null to clear.'),
  due_date: S('Due date as YYYY-MM-DD (alternative to due).'),
  due_time: S('Due time as HH:mm, 24-hour, in the person\'s timezone.'),
}
const PRIORITY = { type: ['integer', 'string'], description: '1 = urgent (p1) … 4 = none (p4).' }

export const TOOLS: Tool[] = [
  {
    name: 'list_tasks', title: 'List tasks', readOnly: true, run: listTasks,
    description: 'List open tasks with a Todoist-style filter. Defaults to "today | overdue". Examples: "7 days", "tomorrow", "#Work & p1", "@errands", "no date", "search: invoice", "all".',
    inputSchema: obj({ filter: S('Filter query. Combine with & | ! and parentheses.'), limit: { type: 'integer', minimum: 1, maximum: 200 } }),
  },
  {
    name: 'add_task', title: 'Add a task', run: addTask,
    description: 'Add a task. The content may use Quick Add syntax, e.g. "Pay rent on the 1st every month #Home @bills p1". Tasks an agent adds are marked as AI-made in the app.',
    inputSchema: obj({
      content: S('The task, optionally with Quick Add syntax.'), description: S('Notes.'), ...DUE, priority: PRIORITY,
      project: S('Project name or id. Created if it does not exist. Defaults to Inbox.'), labels: { type: 'array', items: { type: 'string' }, description: 'Label names; created if missing.' },
      parent_id: S('Make it a subtask of this task id.'), parse: { type: 'boolean', description: 'Set false to keep the content literal.' },
    }, ['content']),
  },
  {
    name: 'update_task', title: 'Update a task', run: updateTask,
    description: 'Change a task\'s text, notes, due date, priority, project or labels. Only the fields you pass change.',
    inputSchema: obj({ id: S('Task id.'), content: S('New text.'), description: S('New notes.'), ...DUE, priority: PRIORITY, project: S('Move to this project.'), labels: { type: 'array', items: { type: 'string' }, description: 'Replace labels with these.' } }, ['id']),
  },
  {
    name: 'complete_task', title: 'Complete a task', run: completeTask,
    description: 'Mark a task done. A recurring task moves to its next date instead, as in the app.',
    inputSchema: obj({ id: S('Task id.') }, ['id']),
  },
  { name: 'reopen_task', title: 'Reopen a task', run: reopenTask, description: 'Mark a completed task as not done.', inputSchema: obj({ id: S('Task id.') }, ['id']) },
  {
    name: 'delete_task', title: 'Delete a task', destructive: true, run: deleteTask,
    description: 'Permanently delete a task and its subtasks. Confirm with the person first.',
    inputSchema: obj({ id: S('Task id.') }, ['id']),
  },
  { name: 'list_projects', title: 'List projects and labels', readOnly: true, run: listProjects, description: 'All projects (with open task counts) and label names.', inputSchema: obj({}) },
  { name: 'add_project', title: 'Add a project', run: addProject, description: 'Create a project.', inputSchema: obj({ name: S('Project name.') }, ['name']) },
  { name: 'search', title: 'Search tasks', readOnly: true, run: search, description: 'Find tasks (open and completed) whose text contains the query. Returns ids, titles and links.', inputSchema: obj({ query: S('Text to look for.') }, ['query']) },
  { name: 'fetch', title: 'Fetch a task', readOnly: true, run: fetchTask, description: 'Full details of one task by id, as returned by search.', inputSchema: obj({ id: S('Task id.') }, ['id']) },
]

/* ─── JSON-RPC ──────────────────────────────────────────────────────────── */

interface Rpc {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const INSTRUCTIONS = `CalmList is the person's to-do list. Dates and times are in their timezone. Priorities run p1 (urgent) to p4 (none).
Look tasks up with list_tasks or search before changing them, and confirm before deleting.`

/** Handles one JSON-RPC message. Returns null for notifications, which get no reply. */
export async function handleRpc(msg: Rpc, store: AgentStore, opts: ServerOptions): Promise<object | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request')
  if (msg.id === undefined) return null

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '')
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'calmlist', title: 'CalmList', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({
        tools: TOOLS.map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
        })),
      })
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name)
      if (!tool) return fail(-32602, `Unknown tool: ${String(msg.params?.name)}`)
      try {
        const { data, now } = await load(store)
        const ctx: Ctx = { data, now, changes: [], opts }
        const result = tool.run(ctx, (msg.params?.arguments as Args) ?? {})
        if (ctx.changes.length) await store.write(ctx.changes)
        return reply({ content: [{ type: 'text', text: result.text }], ...(result.structured && { structuredContent: result.structured }), isError: false })
      } catch (e) {
        if (e instanceof ToolError) return reply({ content: [{ type: 'text', text: e.message }], isError: true })
        throw e
      }
    }
    case 'resources/list':
      return reply({ resources: [] })
    case 'prompts/list':
      return reply({ prompts: [] })
    default:
      return fail(-32601, `Method not found: ${msg.method}`)
  }
}
