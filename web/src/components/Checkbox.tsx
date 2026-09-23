import { Check } from 'lucide-react'
import type { Priority } from '../lib/types'

interface Props {
  checked: boolean
  priority: Priority
  onToggle(): void
  label: string
}

export function Checkbox({ checked, priority, onToggle, label }: Props) {
  return (
    <button
      className="check"
      data-priority={priority}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  )
}
