import { Archive, CircleCheck, Ellipsis, LayoutGrid, List, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { Popover, usePopover } from '../components/Popover'
import { AddSection, SectionHead } from '../components/Sections'
import { SortableTasks, TaskDnd } from '../components/TaskDnd'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { countOpen, rootTasks, sectionsOf } from '../lib/select'
import type { Project } from '../lib/types'
import { deleteProject, updateProject } from '../store/actions'
import { useUI } from '../store/ui'
import { Board } from './Board'

function ProjectMenu({ project, showCompleted, onShowCompleted }: { project: Project; showCompleted: boolean; onShowCompleted(v: boolean): void }) {
  const menu = usePopover()
  const { open, toast } = useUI()
  const navigate = useNavigate()
  const act = (fn: () => void) => () => (fn(), menu.close())

  return (
    <>
      <button className="icon-btn" aria-label="Project actions" title="More" onClick={menu.toggle} aria-expanded={menu.open}><Ellipsis size={18} /></button>
      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={230} label="Project actions">
          <div className="menu-list">
            {!project.inbox && <button className="menu-item" onClick={act(() => open({ type: 'project', id: project.id }))}><Pencil size={14} /> Edit project</button>}
            {!project.inbox && (
              <button className="menu-item" onClick={act(() => updateProject(project.id, { favorite: !project.favorite }))}>
                <Star size={14} /> {project.favorite ? 'Remove from favorites' : 'Add to favorites'}
              </button>
            )}
            <button className="menu-item" onClick={act(() => onShowCompleted(!showCompleted))}>
              <CircleCheck size={14} /> {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
            {!project.inbox && (
              <>
                <div className="menu-sep" />
                <button className="menu-item" onClick={act(() => {
                  updateProject(project.id, { archived: !project.archived })
                  toast(project.archived ? `Unarchived: ${project.name}` : `Archived: ${project.name}`)
                })}>
                  <Archive size={14} /> {project.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button className="menu-item is-danger" onClick={act(() => open({
                  type: 'confirm',
                  title: 'Delete project?',
                  body: `“${project.name}” and all of its tasks will be deleted. You can undo right after.`,
                  action: 'Delete',
                  onConfirm: () => {
                    const inverse = deleteProject(project.id)
                    navigate('/inbox')
                    toast(`Deleted project: ${project.name}`, inverse)
                  },
                }))}>
                  <Trash2 size={14} /> Delete project
                </button>
              </>
            )}
          </div>
        </Popover>
      )}
    </>
  )
}

export function ProjectView({ id: fixed }: { id?: string }) {
  const params = useParams()
  const id = fixed ?? params.id ?? ''
  const data = useData()
  const [showCompleted, setShowCompleted] = useState(false)
  const project = data.projects[id]
  const sections = useMemo(() => sectionsOf(data, id), [data, id])
  const completed = useMemo(
    () => Object.values(data.tasks).filter((t) => t.projectId === id && t.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [data, id],
  )

  if (!project) return <Navigate to="/today" replace />
  const count = countOpen(data, id)
  const board = project.view === 'board'

  const actions = (
    <>
      <button
        className="icon-btn"
        aria-label={board ? 'Show as list' : 'Show as board'}
        title={board ? 'List' : 'Board'}
        onClick={() => updateProject(id, { view: board ? 'list' : 'board' })}
      >
        {board ? <List size={18} /> : <LayoutGrid size={18} />}
      </button>
      <ProjectMenu project={project} showCompleted={showCompleted} onShowCompleted={setShowCompleted} />
    </>
  )

  return (
    <Page
      title={project.inbox ? 'Inbox' : project.name}
      eyebrow={`${project.archived ? 'Archived · ' : ''}${count} open task${count === 1 ? '' : 's'}`}
      actions={actions}
      wide={board}
    >
      {board ? (
        <Board project={project} />
      ) : (
        <TaskDnd projectId={id}>
          <SortableTasks tasks={rootTasks(data, id, null)} sectionId={null} nested />
          <InlineAdd defaults={{ projectId: id }} />
          {sections.map((s) => {
            const tasks = rootTasks(data, id, s.id)
            return (
              <section key={s.id} className="group">
                <SectionHead section={s} count={tasks.length} />
                {!s.collapsed && (
                  <>
                    <SortableTasks tasks={tasks} sectionId={s.id} nested />
                    <InlineAdd defaults={{ projectId: id, sectionId: s.id }} />
                  </>
                )}
              </section>
            )
          })}
          <AddSection projectId={id} />
        </TaskDnd>
      )}

      {showCompleted && completed.length > 0 && (
        <section className="group">
          <header className="group-head"><h2>Completed</h2><span className="micro">{completed.length}</span></header>
          <TaskList tasks={completed} />
        </section>
      )}

      {count === 0 && !board && (
        <div className="empty">
          <h2>{project.inbox ? 'Inbox zero.' : 'Nothing here yet.'}</h2>
          <p>{project.inbox ? 'Everything is where it belongs. New tasks without a project land here.' : 'Add a task, or split the work into sections.'}</p>
          {!project.inbox && (
            <button className="btn btn-primary" onClick={() => useUI.getState().open({ type: 'quickAdd', defaults: { projectId: id } })}>
              <Plus size={16} /> Add Task
            </button>
          )}
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
