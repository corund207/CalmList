import type { ImportedProject } from '../lib/todoist'
import type { ID } from '../lib/types'
import { addComment, addLabel, addProject, addSection, addTask } from './actions'

/** Recreates a Todoist project export as a CalmList project; indentation becomes sub-tasks. */
export const importTodoistProject = (p: ImportedProject) => {
  const project = addProject(p.name)
  const sections = new Map(p.sections.map((name) => [name, addSection(project.id, name).id]))
  const parents: ID[] = []
  for (const t of p.tasks) {
    const parentId = t.depth > 0 ? (parents[t.depth - 1] ?? null) : null
    const task = addTask({
      content: t.content,
      description: t.description,
      priority: t.priority,
      due: t.due,
      labels: t.labels.map((name) => addLabel(name).id),
      projectId: project.id,
      sectionId: t.section ? (sections.get(t.section) ?? null) : null,
      parentId,
    })
    parents[t.depth] = task.id
    parents.length = t.depth + 1
    for (const c of t.comments) addComment(task.id, c)
  }
  return project
}
