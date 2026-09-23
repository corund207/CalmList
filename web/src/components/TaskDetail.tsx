import { CalendarDays, ChevronDown, Crosshair, Ellipsis, Flag, Tag, Trash2, X, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../hooks'
import { formatDate, formatDue } from '../lib/dates'
import { describeRecurrence } from '../lib/recurrence'
import { byOrder, children } from '../lib/select'
import type { Task } from '../lib/types'
import { addComment, deleteComment, duplicateTask, updateTask } from '../store/actions'
import { complete, remove } from '../store/taskOps'
import { Checkbox } from './Checkbox'
import { Modal } from './Modal'
import { DatePicker, LabelPicker, PriorityPicker, PRIORITY_NAMES, ProjectPicker } from './pickers'
import { Popover, usePopover } from './Popover'
import { InlineAdd, TaskList } from './TaskList'

/** A textarea that grows with its content and saves when it loses focus. */
function AutoText({ value, onSave, className, placeholder, label, singleLine }: {
  value: string
  onSave(v: string): void
  className: string
  placeholder?: string
  label: string
  singleLine?: boolean
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  const save = () => {
    const v = singleLine ? text.trim() : text
    if (singleLine && !v) return setText(value)
    if (v !== value) onSave(v)
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(singleLine ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <span className="micro">{label}</span>
      {children}
    </div>
  )
}

function Detail({ task, onClose }: { task: Task; onClose(): void }) {
  const data = useData()
  const [, setParams] = useSearchParams()
  const [comment, setComment] = useState('')
  const project = usePopover()
  const date = usePopover()
  const deadline = usePopover()
  const prio = usePopover()
  const labels = usePopover()
  const more = usePopover()

  const proj = data.projects[task.projectId]
  const section = task.sectionId ? data.sections[task.sectionId] : null
  const parent = task.parentId ? data.tasks[task.parentId] : null
  const subtasks = children(data, task.id)
  const doneSubtasks = children(data, task.id, true).filter((t) => t.completed)
  const comments = Object.values(data.comments).filter((c) => c.taskId === task.id).sort((a, b) => a.createdAt - b.createdAt)
  const labelList = task.labels.map((id) => data.labels[id]).filter(Boolean).sort(byOrder)

  const post = () => {
    if (!comment.trim()) return
    addComment(task.id, comment.trim())
    setComment('')
  }

  return (
    <div className="detail">
      <header className="detail-head">
        <span className="detail-crumb micro">
          {proj?.inbox ? 'Inbox' : proj?.name}
          {section && ` / ${section.name}`}
          {parent && (
            <>
              {' / '}
              <button className="link" onClick={() => setParams((p) => (p.set('task', parent.id), p))}>{parent.content}</button>
            </>
          )}
        </span>
        <button className="icon-btn" aria-label="More actions" onClick={more.toggle} aria-expanded={more.open}><Ellipsis size={18} /></button>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="detail-body">
        <div className="detail-main">
          <div className="detail-title">
            <Checkbox checked={task.completed} priority={task.priority} onToggle={() => complete(task)} label={task.completed ? 'Reopen task' : 'Complete task'} />
            <AutoText className="detail-content" value={task.content} label="Task name" singleLine onSave={(content) => updateTask(task.id, { content })} />
          </div>
          <AutoText className="detail-desc" value={task.description} label="Description" placeholder="Add notes" onSave={(description) => updateTask(task.id, { description })} />

          <section className="detail-section">
            <h3 className="label">Sub-tasks {subtasks.length + doneSubtasks.length > 0 && <span>{doneSubtasks.length}/{subtasks.length + doneSubtasks.length}</span>}</h3>
            <TaskList tasks={subtasks} nested />
            <InlineAdd label="Add sub-task" defaults={{ projectId: task.projectId, sectionId: task.sectionId, parentId: task.id }} />
            {doneSubtasks.length > 0 && <TaskList tasks={doneSubtasks} />}
          </section>

          <section className="detail-section">
            <h3 className="label">Comments {comments.length > 0 && <span>{comments.length}</span>}</h3>
            <ul className="comments">
              {comments.map((c) => (
                <li key={c.id} className="comment">
                  <div className="comment-meta micro">
                    {new Date(c.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    <button className="link" onClick={() => deleteComment(c.id)}>Delete</button>
                  </div>
                  <p>{c.content}</p>
                </li>
              ))}
            </ul>
            <div className="comment-box">
              <textarea
                className="field comment-input"
                rows={2}
                placeholder="Comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && post()}
              />
              <button className="btn btn-primary btn-sm" disabled={!comment.trim()} onClick={post}>Comment</button>
            </div>
          </section>
        </div>

        <aside className="detail-side">
          <Field label="Project">
            <button className="side-btn" onClick={project.toggle} aria-expanded={project.open}>
              <span className="nav-hash">#</span>
              <span className="grow">{proj?.inbox ? 'Inbox' : proj?.name}{section ? ` / ${section.name}` : ''}</span>
              <ChevronDown size={14} />
            </button>
          </Field>
          <Field label="Date">
            <button className="side-btn" data-set={!!task.due || undefined} onClick={date.toggle} aria-expanded={date.open}>
              <CalendarDays size={14} />
              <span className="grow">{task.due ? formatDue(task.due) : 'No date'}</span>
            </button>
            {task.due?.recurrence && <span className="side-note micro">{describeRecurrence(task.due.recurrence)}</span>}
          </Field>
          <Field label="Deadline">
            <button className="side-btn" data-set={!!task.deadline || undefined} onClick={deadline.toggle} aria-expanded={deadline.open}>
              <Crosshair size={14} />
              <span className="grow">{task.deadline ? formatDate(task.deadline) : 'No deadline'}</span>
            </button>
          </Field>
          <Field label="Priority">
            <button className="side-btn" onClick={prio.toggle} aria-expanded={prio.open}>
              <Flag size={14} />
              <span className="grow">{PRIORITY_NAMES[task.priority]}</span>
            </button>
          </Field>
          <Field label="Labels">
            <button className="side-btn" onClick={labels.toggle} aria-expanded={labels.open}>
              <Tag size={14} />
              <span className="grow">{labelList.length ? labelList.map((l) => `@${l.name}`).join(' ') : 'No labels'}</span>
            </button>
          </Field>
          <p className="side-note micro">Created {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </aside>
      </div>

      {project.open && (
        <Popover anchor={project.anchor} onClose={project.close} width={280} label="Project">
          <ProjectPicker projectId={task.projectId} sectionId={task.sectionId} onChange={(projectId, sectionId) => (updateTask(task.id, { projectId, sectionId, parentId: null }), project.close())} />
        </Popover>
      )}
      {date.open && (
        <Popover anchor={date.anchor} onClose={date.close} width={290} label="Due date">
          <DatePicker value={task.due} onChange={(due) => (updateTask(task.id, { due }), date.close())} />
        </Popover>
      )}
      {deadline.open && (
        <Popover anchor={deadline.anchor} onClose={deadline.close} width={290} label="Deadline">
          <DatePicker
            value={task.deadline ? { date: task.deadline } : null}
            onChange={(due) => (updateTask(task.id, { deadline: due?.date ?? null }), deadline.close())}
          />
        </Popover>
      )}
      {prio.open && (
        <Popover anchor={prio.anchor} onClose={prio.close} width={200} label="Priority">
          <PriorityPicker value={task.priority} onChange={(priority) => (updateTask(task.id, { priority }), prio.close())} />
        </Popover>
      )}
      {labels.open && (
        <Popover anchor={labels.anchor} onClose={labels.close} label="Labels">
          <LabelPicker value={task.labels} onChange={(ids) => updateTask(task.id, { labels: ids })} />
        </Popover>
      )}
      {more.open && (
        <Popover anchor={more.anchor} onClose={more.close} width={200} label="Task actions">
          <div className="menu-list">
            <button className="menu-item" onClick={() => (duplicateTask(task.id), more.close())}><Copy size={14} /> Duplicate</button>
            <button className="menu-item is-danger" onClick={() => (remove(task), onClose())}><Trash2 size={14} /> Delete task</button>
          </div>
        </Popover>
      )}
    </div>
  )
}

/** Opens the task named in the URL (?task=id) as a modal over the current view. */
export function TaskDetailHost() {
  const [params, setParams] = useSearchParams()
  const data = useData()
  const id = params.get('task')
  const task = id ? data.tasks[id] : undefined
  if (!task) return null
  const close = () => setParams((p) => (p.delete('task'), p))
  return (
    <Modal onClose={close} label={`Task: ${task.content}`} size="lg">
      <Detail key={task.id} task={task} onClose={close} />
    </Modal>
  )
}
