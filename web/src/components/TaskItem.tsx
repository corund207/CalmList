import { CalendarDays, ChevronRight, Copy, Crosshair, Ellipsis, GitBranch, Link, MessageSquare, Pencil, Repeat, Trash2 } from 'lucide-react'
import { memo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../hooks'
import { daysFromToday, formatDate, formatDue, isOverdue, today } from '../lib/dates'
import type { Task } from '../lib/types'
import { duplicateTask, updateTask } from '../store/actions'
import { complete, remove } from '../store/taskOps'
import { useUI } from '../store/ui'
import { Checkbox } from './Checkbox'
import { DatePicker, PriorityPicker, ProjectPicker } from './pickers'
import { publicAppUrl } from '../lib/platform'
import { Popover, usePopover } from './Popover'
import { TaskEditor } from './TaskEditor'

interface Props {
  task: Task
  showProject?: boolean
  hideDate?: boolean
  depth?: number
  collapsed?: boolean
  onToggleCollapse?(): void
  handle?: ReactNode
}

export const TaskItem = memo(function TaskItem({ task, showProject, hideDate, depth = 0, collapsed, onToggleCollapse, handle }: Props) {
  const data = useData()
  const [, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [checking, setChecking] = useState(false)
  const toast = useUI((s) => s.toast)
  const date = usePopover()
  const more = usePopover()
  const [menuView, setMenuView] = useState<'main' | 'move'>('main')

  const kids = Object.values(data.tasks).filter((t) => t.parentId === task.id)
  const doneKids = kids.filter((k) => k.completed).length
  const comments = Object.values(data.comments).filter((c) => c.taskId === task.id).length
  const project = data.projects[task.projectId]
  const section = task.sectionId ? data.sections[task.sectionId] : null
  const overdue = isOverdue(task.due)

  const open = () => setParams((p) => (p.set('task', task.id), p))
  const check = () => {
    if (task.completed) return complete(task)
    setChecking(true)
    setTimeout(() => {
      setChecking(false)
      complete(task)
    }, 280)
  }

  if (editing)
    return (
      <div role="listitem" className="task-edit" style={{ '--depth': depth } as CSSProperties}>
        <TaskEditor
          submitLabel="Save"
          initial={{ ...task }}
          onCancel={() => setEditing(false)}
          onSubmit={(fields) => {
            updateTask(task.id, fields)
            setEditing(false)
          }}
        />
      </div>
    )

  return (
    <div
      role="listitem"
      className="task"
      data-checking={checking || undefined}
      data-completed={task.completed || undefined}
      style={{ '--depth': depth } as CSSProperties}
      onClick={(e) => e.currentTarget.contains(e.target as Node) && !(e.target as HTMLElement).closest('button, a, input') && open()}
    >
      {handle}
      {onToggleCollapse ? (
        <button className="task-collapse" aria-expanded={!collapsed} aria-label={collapsed ? 'Show subtasks' : 'Hide subtasks'} onClick={onToggleCollapse}>
          <ChevronRight size={14} />
        </button>
      ) : null}
      <Checkbox checked={task.completed || checking} priority={task.priority} onToggle={check} label={`Complete “${task.content}”`} />

      <div className="task-body">
        <button className="task-content" onClick={open}>{task.content}</button>
        {task.description && <p className="task-desc">{task.description.split('\n')[0]}</p>}
        <div className="task-meta">
          {task.due && !hideDate && (
            <span className="meta" data-when={overdue ? 'overdue' : daysFromToday(task.due.date) === 0 ? 'today' : undefined}>
              <CalendarDays size={12} />
              {formatDue(task.due)}
              {task.due.recurrence && <Repeat size={11} aria-label="Repeats" />}
            </span>
          )}
          {task.due && hideDate && task.due.time && <span className="meta" data-when="today">{formatDue(task.due).replace(/^\S+\s/, '')}</span>}
          {task.due?.recurrence && hideDate && <span className="meta"><Repeat size={11} aria-label="Repeats" /></span>}
          {task.deadline && (
            <span className="meta" data-when={task.deadline < today() ? 'overdue' : undefined}>
              <Crosshair size={12} /> {formatDate(task.deadline)}
            </span>
          )}
          {kids.length > 0 && <span className="meta"><GitBranch size={12} /> {doneKids}/{kids.length}</span>}
          {comments > 0 && <span className="meta"><MessageSquare size={12} /> {comments}</span>}
          {task.labels.map((id) => data.labels[id] && <span key={id} className="meta is-label">@{data.labels[id].name}</span>)}
          {showProject && project && (
            <span className="meta is-project">{project.inbox ? 'Inbox' : project.name}{section ? ` / ${section.name}` : ''} #</span>
          )}
        </div>
      </div>

      <div className="task-actions">
        <button className="icon-btn" aria-label="Edit" title="Edit" onClick={() => setEditing(true)}><Pencil size={16} /></button>
        <button className="icon-btn" aria-label="Set date" title="Date" onClick={date.toggle} aria-expanded={date.open}><CalendarDays size={16} /></button>
        <button className="icon-btn" aria-label="More actions" title="More" onClick={(e) => (setMenuView('main'), more.toggle(e))} aria-expanded={more.open}><Ellipsis size={16} /></button>
      </div>

      {date.open && (
        <Popover anchor={date.anchor} onClose={date.close} width={290} label="Due date">
          <DatePicker value={task.due} onChange={(due) => (updateTask(task.id, { due }), date.close())} />
        </Popover>
      )}
      {more.open && (
        <Popover anchor={more.anchor} onClose={more.close} width={menuView === 'move' ? 280 : 230} label="Task actions">
          {menuView === 'move' ? (
            <ProjectPicker
              projectId={task.projectId}
              sectionId={task.sectionId}
              onChange={(projectId, sectionId) => (updateTask(task.id, { projectId, sectionId, parentId: projectId === task.projectId ? task.parentId : null }), more.close())}
            />
          ) : (
            <div className="menu-list">
              <button className="menu-item" onClick={() => (setEditing(true), more.close())}><Pencil size={14} /> Edit</button>
              <div className="menu-sep" />
              <div className="menu-caption label">Priority</div>
              <PriorityPicker value={task.priority} onChange={(priority) => (updateTask(task.id, { priority }), more.close())} />
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => setMenuView('move')}><span className="nav-hash">#</span> Move to…</button>
              <button className="menu-item" onClick={() => (duplicateTask(task.id), more.close())}><Copy size={14} /> Duplicate</button>
              <button
                className="menu-item"
                onClick={() => {
                  navigator.clipboard?.writeText(`${publicAppUrl()}#/task/${task.id}`)
                  toast('Link copied')
                  more.close()
                }}
              >
                <Link size={14} /> Copy link
              </button>
              <div className="menu-sep" />
              <button className="menu-item is-danger" onClick={() => (remove(task), more.close())}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </Popover>
      )}
    </div>
  )
})
