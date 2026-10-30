// View transitions for authored moments. Each run tags the document (data-vt) so motion.css can give that
// moment its own animation; without support, or with reduced motion, the update simply happens.
import { flushSync } from 'react-dom'

type Doc = Document & { startViewTransition?: (fn: () => void) => { finished: Promise<void> } }

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function viewTransition(kind: string, update: () => void, vars: Record<string, string> = {}) {
  const doc = document as Doc
  if (!doc.startViewTransition || prefersReducedMotion()) return update()
  const root = document.documentElement
  root.dataset.vt = kind
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  doc.startViewTransition(() => flushSync(update)).finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt
  })
}

/** A new theme spreads from the point that was clicked. */
export function themeReveal(e: { clientX: number; clientY: number }, update: () => void) {
  const x = e.clientX || innerWidth / 2
  const y = e.clientY || innerHeight / 2
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  viewTransition('theme', update, { '--reveal-x': `${x}px`, '--reveal-y': `${y}px`, '--reveal-r': `${r}px` })
}
