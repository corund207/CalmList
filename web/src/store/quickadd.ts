import type { Parsed } from '../lib/parse'
import type { Data, Due, ID, Priority } from '../lib/types'
import { addLabel, addProject, addSection, inboxId } from './actions'

export interface Draft {
  content: string
  description: string
  due: Due | null
  deadline: string | null
  priority: Priority
  labels: ID[]
  projectId: ID
  sectionId: ID | null
}

const byName = <T extends { name: string }>(items: T[], name: string) => items.find((i) => i.name.toLowerCase() === name.toLowerCase())

/** What the task will look like: typed tokens win over values picked from menus. */
export const preview = (draft: Draft, parsed: Parsed, data: Data) => {
  const project = parsed.project ? byName(Object.values(data.projects), parsed.project) : undefined
  const projectId = project?.id ?? draft.projectId
  const section = parsed.section ? byName(Object.values(data.sections).filter((s) => s.projectId === projectId), parsed.section) : undefined
  const labelIds = parsed.labels.map((n) => byName(Object.values(data.labels), n)?.id).filter(Boolean) as ID[]
  return {
    due: parsed.due ?? draft.due,
    deadline: parsed.deadline ?? draft.deadline,
    priority: parsed.priority ?? draft.priority,
    projectId,
    sectionId: project && !section ? null : (section?.id ?? draft.sectionId),
    labels: [...new Set([...draft.labels, ...labelIds])],
    newProject: parsed.project && !project ? parsed.project : null,
    newSection: parsed.section && !section ? parsed.section : null,
    newLabels: parsed.labels.filter((n) => !byName(Object.values(data.labels), n)),
  }
}

/** Turns a draft plus its typed tokens into task fields, creating any new project, section or labels. */
export const resolve = (draft: Draft, parsed: Parsed, data: Data) => {
  const p = preview(draft, parsed, data)
  const projectId = p.newProject ? addProject(p.newProject).id : p.projectId || inboxId()
  const sectionId = p.newSection ? addSection(projectId, p.newSection).id : p.sectionId
  const labels = [...p.labels, ...p.newLabels.map((n) => addLabel(n).id)]
  return {
    content: parsed.content,
    description: draft.description,
    due: p.due,
    deadline: p.deadline,
    priority: p.priority,
    projectId,
    sectionId,
    labels,
  }
}
