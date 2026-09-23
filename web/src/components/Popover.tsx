import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  anchor: HTMLElement | null
  onClose(): void
  children: ReactNode
  width?: number
  label?: string
}

/** A floating panel pinned to an element, flipped to stay on screen. */
export function Popover({ anchor, onClose, children, width = 260, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    // Clicks on the anchor are left to its own toggle.
    const on = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    document.addEventListener('pointerdown', on)
    return () => document.removeEventListener('pointerdown', on)
  }, [anchor, onClose])

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const h = ref.current!.offsetHeight
      const top = a.bottom + 6 + h > innerHeight - 8 ? Math.max(8, a.top - 6 - h) : a.bottom + 6
      const left = Math.max(8, Math.min(a.left, innerWidth - width - 8))
      setPos({ top, left })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(ref.current)
    addEventListener('resize', place)
    return () => {
      ro.disconnect()
      removeEventListener('resize', place)
    }
  }, [anchor, width])

  return createPortal(
    <div
      ref={ref}
      className="popover"
      role="dialog"
      aria-label={label}
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
          anchor?.focus()
        }
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Keeps the popover's open state and the element it hangs from. */
export const usePopover = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return {
    anchor,
    open: !!anchor,
    toggle: (e: { currentTarget: HTMLElement }) => setAnchor((a) => (a ? null : e.currentTarget)),
    close: useCallback(() => setAnchor(null), []),
  }
}
