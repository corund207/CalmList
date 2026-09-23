import { X } from 'lucide-react'
import { undo, useUI } from '../store/ui'

export function Toasts() {
  const { toasts, dismiss } = useUI()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-msg">{t.message}</span>
          {t.undo && <button className="toast-undo" onClick={() => undo(t)}>Undo</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}
