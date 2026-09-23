import { compareDue, toISO, today } from './dates'
import type { Data, ID, Task } from './types'

export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

/** Sort used in date views: priority, then time, then manual order. */
export const byUrgency = (a: Task, b: Task) => a.priority - b.priority || compareDue(a.due, b.due) || a.order - b.order

export const children = (data: Data, parentId: ID, includeCompleted = false) =>
  Object.values(data.tasks)
    .filter((t) => t.parentId === parentId && (includeCompleted || !t.completed))
    .sort(byOrder)

export const descendants = (data: Data, id: ID): Task[] =>
  children(data, id, true).flatMap((c) => [c, ...descendants(data, c.id)])

export const openTasks = (data: Data) => Object.values(data.tasks).filter((t) => !t.completed && data.projects[t.projectId] && !data.projects[t.projectId].archived)

export const projectsSorted = (data: Data) =>
  Object.values(data.projects).filter((p) => !p.inbox && !p.archived).sort(byOrder)

export const sectionsOf = (data: Data, projectId: ID) =>
  Object.values(data.sections).filter((s) => s.projectId === projectId).sort(byOrder)

/** Top-level open tasks in a project section (null = no section). */
export const rootTasks = (data: Data, projectId: ID, sectionId: ID | null) =>
  Object.values(data.tasks)
    .filter((t) => t.projectId === projectId && t.sectionId === sectionId && !t.parentId && !t.completed)
    .sort(byOrder)

export const overdueTasks = (data: Data) => {
  const t = today()
  return openTasks(data).filter((x) => x.due && x.due.date < t).sort((a, b) => compareDue(a.due, b.due) || byUrgency(a, b))
}

export const tasksOn = (data: Data, iso: string) =>
  openTasks(data).filter((x) => x.due?.date === iso).sort(byUrgency)

export const completedToday = (data: Data) => {
  const t = today()
  return Object.values(data.events).filter((e) => toISO(new Date(e.createdAt)) === t).length
}

export const countOpen = (data: Data, projectId: ID) => openTasks(data).filter((t) => t.projectId === projectId).length
