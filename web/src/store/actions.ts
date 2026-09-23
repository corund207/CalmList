import { uid } from '../lib/id'
import { nextOccurrence } from '../lib/recurrence'
import { descendants } from '../lib/select'
import type { Collections, Filter, ID, Kind, Label, Project, Section, Task } from '../lib/types'
import type { Change } from './backend'
import { commit, useStore } from './store'

const data = () => useStore.getState().data
const put = <K extends Kind>(kind: K, entity: Collections[K]): Change => ({ kind, id: entity.id, data: entity })
const drop = (kind: Kind, id: ID): Change => ({ kind, id, data: null })
const stamp = () => {
  const t = Date.now()
  return { id: uid(), createdAt: t, updatedAt: t }
}

const nextOrder = (items: { order: number }[]) => items.reduce((max, i) => Math.max(max, i.order), -1) + 1

export const inboxId = () => Object.values(data().projects).find((p) => p.inbox)?.id ?? ''

/* Tasks */

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { content: string }

export const buildTask = (input: TaskInput): Task => {
  const projectId = input.projectId || inboxId()
  const siblings = Object.values(data().tasks).filter(
    (t) => t.projectId === projectId && t.sectionId === (input.sectionId ?? null) && t.parentId === (input.parentId ?? null),
  )
  return {
    ...stamp(),
    description: '',
    sectionId: null,
    parentId: null,
    priority: 4,
    due: null,
    labels: [],
    completed: false,
    completedAt: null,
    order: nextOrder(siblings),
    ...input,
    projectId,
  }
}

export const addTask = (input: TaskInput) => {
  const task = buildTask(input)
  commit([put('tasks', task)])
  return task
}

export const updateTask = (id: ID, patch: Partial<Task>) => {
  const task = data().tasks[id]
  if (!task) return []
  const moved = patch.projectId !== undefined && patch.projectId !== task.projectId
  // Subtasks follow their parent across projects.
  const kids = moved ? descendants(data(), id).map((t) => put('tasks', { ...t, projectId: patch.projectId!, sectionId: null, updatedAt: Date.now() })) : []
  return commit([put('tasks', { ...task, ...patch, updatedAt: Date.now() }), ...kids])
}

/** Completes or reopens a task. Returns the inverse changes for undo. */
export const toggleTask = (id: ID) => {
  const d = data()
  const task = d.tasks[id]
  if (!task) return []
  const t = Date.now()

  if (task.completed) {
    // Reopening a subtask reopens its completed ancestors too.
    const changes: Change[] = []
    for (let cur: Task | undefined = task; cur; cur = cur.parentId ? d.tasks[cur.parentId] : undefined)
      if (cur.completed) changes.push(put('tasks', { ...cur, completed: false, completedAt: null, updatedAt: t }))
    return commit(changes)
  }

  const event = put('events', { ...stamp(), type: 'completed', taskId: id, content: task.content, projectId: task.projectId })
  const kids = descendants(d, id)

  if (task.due?.recurrence) {
    const reset = kids.filter((k) => k.completed).map((k) => put('tasks', { ...k, completed: false, completedAt: null, updatedAt: t }))
    return commit([put('tasks', { ...task, due: nextOccurrence(task.due), updatedAt: t }), ...reset, event])
  }

  const done = [task, ...kids.filter((k) => !k.completed)].map((k) => put('tasks', { ...k, completed: true, completedAt: t, updatedAt: t }))
  return commit([...done, event])
}

export const deleteTask = (id: ID) => {
  const d = data()
  const ids = new Set([id, ...descendants(d, id).map((t) => t.id)])
  const comments = Object.values(d.comments).filter((c) => ids.has(c.taskId))
  return commit([...[...ids].map((i) => drop('tasks', i)), ...comments.map((c) => drop('comments', c.id))])
}

export const duplicateTask = (id: ID) => {
  const d = data()
  const src = d.tasks[id]
  if (!src) return
  const map = new Map<ID, ID>()
  const copies = [src, ...descendants(d, id)].map((t) => {
    const copy = { ...t, ...stamp(), completed: false, completedAt: null }
    map.set(t.id, copy.id)
    return copy
  })
  for (const c of copies) if (c.parentId && map.has(c.parentId)) c.parentId = map.get(c.parentId)!
  copies[0].order = src.order + 0.5
  commit(copies.map((c) => put('tasks', c)))
}

/** Writes a new order for tasks (and optionally moves them), e.g. after a drag. */
export const reorderTasks = (ids: ID[], patch: Partial<Pick<Task, 'projectId' | 'sectionId' | 'parentId'>> = {}) => {
  const d = data()
  const t = Date.now()
  commit(ids.map((id, order) => put('tasks', { ...d.tasks[id], ...patch, order, updatedAt: t })))
}

/* Comments */

export const addComment = (taskId: ID, content: string) => commit([put('comments', { ...stamp(), taskId, content })])
export const deleteComment = (id: ID) => commit([drop('comments', id)])

/* Projects */

export const addProject = (name: string, extra: Partial<Project> = {}) => {
  const project: Project = { ...stamp(), name, view: 'list', order: nextOrder(Object.values(data().projects)), ...extra }
  commit([put('projects', project)])
  return project
}

export const updateProject = (id: ID, patch: Partial<Project>) =>
  commit([put('projects', { ...data().projects[id], ...patch, updatedAt: Date.now() })])

export const deleteProject = (id: ID) => {
  const d = data()
  if (d.projects[id]?.inbox) return []
  const tasks = Object.values(d.tasks).filter((t) => t.projectId === id)
  const taskIds = new Set(tasks.map((t) => t.id))
  return commit([
    drop('projects', id),
    ...Object.values(d.sections).filter((s) => s.projectId === id).map((s) => drop('sections', s.id)),
    ...tasks.map((t) => drop('tasks', t.id)),
    ...Object.values(d.comments).filter((c) => taskIds.has(c.taskId)).map((c) => drop('comments', c.id)),
  ])
}

export const reorder = (kind: 'projects' | 'sections' | 'labels' | 'filters', ids: ID[]) => {
  const bucket = data()[kind] as Record<ID, Project | Section | Label | Filter>
  commit(ids.map((id, order) => ({ kind, id, data: { ...bucket[id], order, updatedAt: Date.now() } }) as Change))
}

/* Sections */

export const addSection = (projectId: ID, name: string) => {
  const siblings = Object.values(data().sections).filter((s) => s.projectId === projectId)
  const section: Section = { ...stamp(), projectId, name, order: nextOrder(siblings) }
  commit([put('sections', section)])
  return section
}

export const updateSection = (id: ID, patch: Partial<Section>) =>
  commit([put('sections', { ...data().sections[id], ...patch, updatedAt: Date.now() })])

export const deleteSection = (id: ID) => {
  const d = data()
  const tasks = Object.values(d.tasks).filter((t) => t.sectionId === id)
  return commit([drop('sections', id), ...tasks.map((t) => drop('tasks', t.id))])
}

/* Labels */

export const findLabel = (name: string) =>
  Object.values(data().labels).find((l) => l.name.toLowerCase() === name.toLowerCase())

export const addLabel = (name: string) => {
  const existing = findLabel(name)
  if (existing) return existing
  const label: Label = { ...stamp(), name, order: nextOrder(Object.values(data().labels)) }
  commit([put('labels', label)])
  return label
}

export const updateLabel = (id: ID, patch: Partial<Label>) =>
  commit([put('labels', { ...data().labels[id], ...patch, updatedAt: Date.now() })])

export const deleteLabel = (id: ID) => {
  const d = data()
  const tagged = Object.values(d.tasks).filter((t) => t.labels.includes(id))
  return commit([drop('labels', id), ...tagged.map((t) => put('tasks', { ...t, labels: t.labels.filter((l) => l !== id) }))])
}

/* Filters */

export const addFilter = (name: string, query: string) => {
  const filter: Filter = { ...stamp(), name, query, order: nextOrder(Object.values(data().filters)) }
  commit([put('filters', filter)])
  return filter
}

export const updateFilter = (id: ID, patch: Partial<Filter>) =>
  commit([put('filters', { ...data().filters[id], ...patch, updatedAt: Date.now() })])

export const deleteFilter = (id: ID) => commit([drop('filters', id)])

/* Bulk */

export const importData = (incoming: Partial<import('../lib/types').Data>) => {
  const changes: Change[] = []
  for (const [kind, bucket] of Object.entries(incoming))
    for (const entity of Object.values(bucket ?? {})) changes.push({ kind: kind as Kind, id: entity.id, data: entity })
  commit(changes)
}
