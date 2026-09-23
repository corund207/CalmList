import type { Task } from '../lib/types'
import { deleteTask, toggleTask } from './actions'
import { useUI } from './ui'

/** Completes (or reopens) a task and offers undo. */
export const complete = (task: Task) => {
  const inverse = toggleTask(task.id)
  if (task.completed) return
  useUI.getState().toast(task.due?.recurrence ? `Rescheduled: ${task.content}` : `Completed: ${task.content}`, inverse)
}

export const remove = (task: Task) => {
  const inverse = deleteTask(task.id)
  useUI.getState().toast(`Deleted: ${task.content}`, inverse)
}
