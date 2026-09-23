import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { countOpen, rootTasks, sectionsOf } from '../lib/select'

export function ProjectView({ id: fixed }: { id?: string }) {
  const params = useParams()
  const id = fixed ?? params.id ?? ''
  const data = useData()
  const project = data.projects[id]
  const loose = useMemo(() => (project ? rootTasks(data, id, null) : []), [data, id, project])

  if (!project) return <Navigate to="/today" replace />
  const count = countOpen(data, id)

  return (
    <Page title={project.inbox ? 'Inbox' : project.name} eyebrow={`${count} open task${count === 1 ? '' : 's'}`}>
      <TaskList tasks={loose} nested />
      <InlineAdd defaults={{ projectId: id }} />
      {sectionsOf(data, id).map((s) => (
        <section key={s.id} className="group">
          <header className="group-head"><h2>{s.name}</h2><span className="micro">{rootTasks(data, id, s.id).length}</span></header>
          <TaskList tasks={rootTasks(data, id, s.id)} nested />
          <InlineAdd defaults={{ projectId: id, sectionId: s.id }} />
        </section>
      ))}
      {count === 0 && project.inbox && (
        <div className="empty">
          <h2>Inbox zero.</h2>
          <p>Everything is where it belongs. New tasks without a project land here.</p>
        </div>
      )}
    </Page>
  )
}

export function Inbox() {
  const data = useData()
  const id = Object.values(data.projects).find((p) => p.inbox)?.id
  return id ? <ProjectView id={id} /> : null
}
