import { addTask } from '../store/actions'
import type { Draft } from '../store/quickadd'
import { useUI } from '../store/ui'
import { Modal } from './Modal'
import { TaskEditor } from './TaskEditor'

export function QuickAdd({ defaults }: { defaults?: Partial<Draft> }) {
  const { close, toast } = useUI()
  return (
    <Modal onClose={close} label="Quick add" align="top">
      <div className="quick-add">
        <TaskEditor
          initial={defaults}
          onCancel={close}
          onSubmit={(fields) => {
            const task = addTask(fields)
            close()
            toast(`Added: ${task.content}`)
          }}
        />
      </div>
    </Modal>
  )
}
