import { PanelLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useScrolled } from '../hooks'
import { usePrefs } from '../store/prefs'

interface Props {
  title: string
  eyebrow?: ReactNode
  actions?: ReactNode
  wide?: boolean
  children: ReactNode
}

/** A view: sticky top bar that picks up the title on scroll, then the page heading. */
export function Page({ title, eyebrow, actions, wide, children }: Props) {
  const scrolled = useScrolled()
  const { sidebar, set } = usePrefs()
  return (
    <>
      <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
        {!sidebar && (
          <button className="icon-btn" onClick={() => set({ sidebar: true })} aria-label="Open sidebar" title="Toggle sidebar  M">
            <PanelLeft size={18} />
          </button>
        )}
        <span className="topbar-title">{title}</span>
        <div className="page-actions">{actions}</div>
      </header>
      <div className={`page${wide ? ' is-wide' : ''}`}>
        <div className="page-head">
          <div>
            {eyebrow && <div className="page-eyebrow label">{eyebrow}</div>}
            <h1 className="page-title">{/[.!?]$/.test(title) ? title : `${title}.`}</h1>
          </div>
        </div>
        {children}
      </div>
    </>
  )
}
