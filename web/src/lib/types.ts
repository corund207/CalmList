export type ID = string
export type Priority = 1 | 2 | 3 | 4 // 1 is most urgent, like Todoist's P1

export interface Recurrence {
  every: number
  unit: 'day' | 'week' | 'month' | 'year'
  weekdays?: number[] // 0 = Sunday; only with unit "week"
  fromCompletion?: boolean // "every!" — next date counts from completion
}

export interface Due {
  date: string // YYYY-MM-DD
  time?: string // HH:mm
  recurrence?: Recurrence
}

interface Base {
  id: ID
  createdAt: number
  updatedAt: number
}

export interface Project extends Base {
  name: string
  order: number
  inbox?: boolean
  favorite?: boolean
  archived?: boolean
  view: 'list' | 'board'
}

export interface Section extends Base {
  projectId: ID
  name: string
  order: number
  collapsed?: boolean
}

export interface Label extends Base {
  name: string
  order: number
  favorite?: boolean
}

export interface Filter extends Base {
  name: string
  query: string
  order: number
  favorite?: boolean
}

export interface Task extends Base {
  content: string
  description: string
  projectId: ID
  sectionId: ID | null
  parentId: ID | null
  order: number
  priority: Priority
  due: Due | null
  deadline?: string | null // YYYY-MM-DD
  labels: ID[]
  completed: boolean
  completedAt: number | null
  /** Set when an AI feature proposed the task (shown in the task view, per the EU AI Act's transparency duty). */
  ai?: boolean
}

export interface Comment extends Base {
  taskId: ID
  content: string
}

export interface Event extends Base {
  type: 'completed'
  taskId: ID
  content: string
  projectId: ID
}

export interface Collections {
  projects: Project
  sections: Section
  labels: Label
  filters: Filter
  tasks: Task
  comments: Comment
  events: Event
}

export type Kind = keyof Collections
export type Entity = Collections[Kind]
export type Data = { [K in Kind]: Record<ID, Collections[K]> }

export const KINDS: Kind[] = ['projects', 'sections', 'labels', 'filters', 'tasks', 'comments', 'events']

export const emptyData = (): Data => ({
  projects: {}, sections: {}, labels: {}, filters: {}, tasks: {}, comments: {}, events: {},
})
