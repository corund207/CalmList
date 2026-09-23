import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isTyping } from '../hooks'
import { usePrefs } from '../store/prefs'
import { useUI } from '../store/ui'

export const SHORTCUTS: [string, string][] = [
  ['Q', 'Quick add a task'],
  ['R', 'Ramble: speak or type a brain dump'],
  ['/', 'Search'],
  ['G then I', 'Go to Inbox'],
  ['G then T', 'Go to Today'],
  ['G then U', 'Go to Upcoming'],
  ['G then F', 'Go to Filters & Labels'],
  ['G then C', 'Go to Completed'],
  ['M', 'Toggle sidebar'],
  ['?', 'Show keyboard shortcuts'],
  ['Enter', 'Save the task you are typing'],
  ['Ctrl / ⌘ + Enter', 'Save from any field'],
  ['Esc', 'Close or cancel'],
]

const GO: Record<string, string> = { i: '/inbox', t: '/today', u: '/upcoming', f: '/filters-labels', c: '/completed' }

/** Global single-key shortcuts, Todoist-style. Ignored while typing or with a dialog open. */
export function useShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    let pendingG = 0
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      const ui = useUI.getState()
      if (ui.dialog) return
      const k = e.key.toLowerCase()
      if (Date.now() - pendingG < 1200 && GO[k]) {
        pendingG = 0
        navigate(GO[k])
        return e.preventDefault()
      }
      if (k === 'g') pendingG = Date.now()
      else if (k === 'q') ui.open({ type: 'quickAdd' })
      else if (k === 'r') ui.open({ type: 'ramble' })
      else if (k === '/') ui.open({ type: 'search' })
      else if (e.key === '?') ui.open({ type: 'shortcuts' })
      else if (k === 'm') usePrefs.getState().set({ sidebar: !usePrefs.getState().sidebar })
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [navigate])
}
