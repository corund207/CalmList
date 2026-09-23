import { AddSection, SectionHead } from '../components/Sections'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { rootTasks, sectionsOf } from '../lib/select'
import type { Project } from '../lib/types'

/** Kanban layout: one column per section, plus loose tasks when there are any. */
export function Board({ project }: { project: Project }) {
  const data = useData()
  const sections = sectionsOf(data, project.id)
  const loose = rootTasks(data, project.id, null)

  return (
    <div className="board">
      {(loose.length > 0 || sections.length === 0) && (
        <section className="column">
          <header className="group-head"><h2>{sections.length ? '(No section)' : 'Tasks'}</h2><span className="micro">{loose.length}</span></header>
          <TaskList tasks={loose} />
          <InlineAdd defaults={{ projectId: project.id }} />
        </section>
      )}
      {sections.map((s) => {
        const tasks = rootTasks(data, project.id, s.id)
        return (
          <section key={s.id} className="column">
            <SectionHead section={s} count={tasks.length} />
            {!s.collapsed && <TaskList tasks={tasks} />}
            <InlineAdd defaults={{ projectId: project.id, sectionId: s.id }} />
          </section>
        )
      })}
      <section className="column is-ghost">
        <AddSection projectId={project.id} variant="column" />
      </section>
    </div>
  )
}
