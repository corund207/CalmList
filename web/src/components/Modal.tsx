import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onClose(): void
  label: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  align?: 'center' | 'top'
}

/** Centered dialog with a dimmed backdrop; Escape and backdrop clicks close it; focus returns after. */
export function Modal({ onClose, label, children, size = 'md', align = 'center' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    return () => prev?.focus?.()
  }, [])

  return createPortal(
    <div
      className="backdrop"
      data-align={align}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div ref={ref} className="modal" data-size={size} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
