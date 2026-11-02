import { PanelLeft, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { useScrolled } from '../hooks'
import { usePrefs } from '../store/prefs'
import { useUI } from '../store/ui'

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
  const open = useUI((s) => s.open)
  return (
    <>
      <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
        {!sidebar && (
          <button className="icon-btn desktop-only" onClick={() => set({ sidebar: true })} aria-label="Open sidebar" title="Toggle sidebar  M">
            <PanelLeft size={18} />
          </button>
        )}
        <span className="topbar-title">{title}</span>
        <div className="page-actions">{actions}</div>
        <button className="icon-btn phone-only" onClick={() => open({ type: 'search' })} aria-label="Search"><Search size={20} /></button>
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
