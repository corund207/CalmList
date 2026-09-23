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

  // Inner controls that handle Escape themselves (popovers, editors) call preventDefault.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close.current()
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  return createPortal(
    <div
      className="backdrop"
      data-align={align}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} className="modal" data-size={size} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
