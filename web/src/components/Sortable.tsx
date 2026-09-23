import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from './dnd'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'

/** A vertical drag-to-reorder list for simple things (projects, labels, filters). */
export function SortableList({ ids, onReorder, children }: { ids: string[]; onReorder(ids: string[]): void; children(id: string): ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => (
          <Item key={id} id={id}>{children(id)}</Item>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function Item({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} className="sortable" data-dragging={isDragging || undefined} style={{ transform: CSS.Translate.toString(transform), transition }} {...listeners}>
      {children}
    </div>
  )
}
