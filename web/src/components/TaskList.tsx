import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useData } from '../hooks'
import { children } from '../lib/select'
import type { Task } from '../lib/types'
import { addTask } from '../store/actions'
import type { Draft } from '../store/quickadd'
import { TaskEditor } from './TaskEditor'
import { TaskItem } from './TaskItem'

interface TreeProps {
  task: Task
  depth?: number
  showProject?: boolean
  hideDate?: boolean
  handle?: ReactNode
  /** Hide subtasks (board cards show a count instead). */
  leaf?: boolean
}

/** A task with its open subtasks nested below, collapsible. */
export function TaskTree({ task, depth = 0, showProject, hideDate, handle, leaf }: TreeProps) {
  const data = useData()
  const [collapsed, setCollapsed] = useState(false)
  const kids = leaf ? [] : children(data, task.id)
  return (
    <>
      <TaskItem
        task={task}
        depth={depth}
        showProject={showProject}
        hideDate={hideDate}
        handle={handle}
        collapsed={collapsed}
        onToggleCollapse={kids.length ? () => setCollapsed((c) => !c) : undefined}
      />
      {!collapsed && kids.map((k) => <TaskTree key={k.id} task={k} depth={depth + 1} showProject={showProject} hideDate={hideDate} />)}
    </>
  )
}

interface ListProps {
  tasks: Task[]
  /** Nest subtasks under parents (project views) or list flat (date views). */
  nested?: boolean
  showProject?: boolean
  hideDate?: boolean
}

export function TaskList({ tasks, nested, showProject, hideDate }: ListProps) {
  return (
    <div className="task-list" role="list">
      {tasks.map((t) =>
        nested ? <TaskTree key={t.id} task={t} showProject={showProject} hideDate={hideDate} /> : <TaskItem key={t.id} task={t} showProject={showProject} hideDate={hideDate} />,
      )}
    </div>
  )
}

/** The "+ Add task" row that expands into an editor and stays open for rapid entry. */
export function InlineAdd({ defaults, label = 'Add task' }: { defaults: Partial<Draft>; label?: string }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button className="inline-add" onClick={() => setOpen(true)}>
        <span className="inline-add-plus"><Plus size={16} /></span>
        {label}
      </button>
    )
  return (
    <div className="inline-editor">
      <TaskEditor initial={defaults} keepOpen onCancel={() => setOpen(false)} onSubmit={(fields) => addTask(fields)} />
    </div>
  )
}
