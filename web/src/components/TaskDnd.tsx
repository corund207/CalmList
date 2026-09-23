import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { rootTasks } from '../lib/select'
import type { ID, Task } from '../lib/types'
import { reorderTasks } from '../store/actions'
import { useStore } from '../store/store'
import { TaskTree } from './TaskList'

const NONE = 'none'
const sectionOf = (container: string) => (container === NONE ? null : container)

/** Drag-and-drop for a project's tasks: reorder within a section or move between sections. */
export function TaskDnd({ projectId, children }: { projectId: ID; children: ReactNode }) {
  const [active, setActive] = useState<Task | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = ({ active }: DragStartEvent) => setActive(useStore.getState().data.tasks[String(active.id)] ?? null)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActive(null)
    if (!over) return
    const data = useStore.getState().data
    const from = String(active.data.current?.container)
    const to = String(over.data.current?.container ?? over.id)
    const ids = (c: string) => rootTasks(data, projectId, sectionOf(c)).map((t) => t.id)
    const id = String(active.id)

    if (from === to) {
      const list = ids(to)
      const next = arrayMove(list, list.indexOf(id), Math.max(0, list.indexOf(String(over.id))))
      if (next.join() !== list.join()) reorderTasks(next)
      return
    }
    const list = ids(to)
    const at = over.data.current?.container ? list.indexOf(String(over.id)) : list.length
    list.splice(at < 0 ? list.length : at, 0, id)
    reorderTasks(list, { sectionId: sectionOf(to) })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {children}
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="task-list drag-overlay" role="list">
            <TaskTree task={active} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SortableTask({ task, container, nested }: { task: Task; container: string; nested?: boolean }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id, data: { container } })
  const handle = (
    <button ref={setActivatorNodeRef} className="drag-handle" aria-label={`Move “${task.content}”`} {...attributes} {...listeners}>
      <GripVertical size={14} />
    </button>
  )
  return (
    <div ref={setNodeRef} className="sortable-task" data-dragging={isDragging || undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {nested ? <TaskTree task={task} handle={handle} /> : <TaskTree task={task} handle={handle} leaf />}
    </div>
  )
}

/** A droppable, sortable list of a section's top-level tasks. */
export function SortableTasks({ tasks, sectionId, nested }: { tasks: Task[]; sectionId: ID | null; nested?: boolean }) {
  const container = sectionId ?? NONE
  const { setNodeRef, isOver } = useDroppable({ id: container })
  return (
    <SortableContext id={container} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="task-list" role="list" data-over={isOver || undefined}>
        {tasks.map((t) => <SortableTask key={t.id} task={t} container={container} nested={nested} />)}
      </div>
    </SortableContext>
  )
}
