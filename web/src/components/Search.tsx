import { ArrowRight, Palette, CalendarDays, CalendarRange, CircleCheck, Filter as FilterIcon, Inbox, Keyboard, LayoutGrid, Plus, Search as SearchIcon, Settings } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../hooks'
import { formatDue } from '../lib/dates'
import { validateFilter } from '../lib/filter'
import { byOrder } from '../lib/select'
import { usePrefs } from '../store/prefs'
import { THEMES } from '../themes/themes'
import { useUI } from '../store/ui'
import { Modal } from './Modal'
import { SHORTCUTS } from './Shortcuts'

interface Item {
  id: string
  group: string
  icon: ReactNode
  label: string
  hint?: string
  run(): void
}

const norm = (s: string) => s.toLowerCase()

/** Command palette: find tasks, projects, labels and filters, or jump anywhere. */
export function SearchDialog() {
  const data = useData()
  const { close, open } = useUI()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo<Item[]>(() => {
    const query = norm(q.trim())
    const go = (to: string) => () => (navigate(to), close())
    const commands: Item[] = [
      { id: 'c-add', group: 'Actions', icon: <Plus size={16} />, label: 'Add task', hint: 'Q', run: () => open({ type: 'quickAdd' }) },
      { id: 'c-inbox', group: 'Navigation', icon: <Inbox size={16} />, label: 'Go to Inbox', hint: 'G I', run: go('/inbox') },
      { id: 'c-today', group: 'Navigation', icon: <CalendarDays size={16} />, label: 'Go to Today', hint: 'G T', run: go('/today') },
      { id: 'c-up', group: 'Navigation', icon: <CalendarRange size={16} />, label: 'Go to Upcoming', hint: 'G U', run: go('/upcoming') },
      { id: 'c-fl', group: 'Navigation', icon: <LayoutGrid size={16} />, label: 'Go to Filters & Labels', hint: 'G F', run: go('/filters-labels') },
      { id: 'c-done', group: 'Navigation', icon: <CircleCheck size={16} />, label: 'Go to Completed', hint: 'G C', run: go('/completed') },
      { id: 'c-set', group: 'Actions', icon: <Settings size={16} />, label: 'Open settings', run: () => open({ type: 'settings' }) },
      { id: 'c-keys', group: 'Actions', icon: <Keyboard size={16} />, label: 'Keyboard shortcuts', hint: '?', run: () => open({ type: 'shortcuts' }) },
    ]
    if (!query) return commands

    const tasks = Object.values(data.tasks)
      .filter((t) => data.projects[t.projectId] && (norm(t.content).includes(query) || norm(t.description).includes(query)))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map<Item>((t) => ({
        id: t.id, group: 'Tasks', icon: <span className="check-mini" data-done={t.completed || undefined} />, label: t.content,
        hint: [t.due && formatDue(t.due), data.projects[t.projectId].inbox ? 'Inbox' : data.projects[t.projectId].name].filter(Boolean).join(' · '),
        run: () => (navigate(`/project/${t.projectId}?task=${t.id}`), close()),
      }))
    const places: Item[] = [
      ...Object.values(data.projects).sort(byOrder).filter((p) => norm(p.name).includes(query))
        .map((p) => ({ id: p.id, group: 'Projects', icon: <span className="nav-hash">#</span>, label: p.inbox ? 'Inbox' : p.name, run: go(`/project/${p.id}`) })),
      ...Object.values(data.labels).sort(byOrder).filter((l) => norm(l.name).includes(query.replace(/^@/, '')))
        .map((l) => ({ id: l.id, group: 'Labels', icon: <span className="nav-hash">@</span>, label: l.name, run: go(`/label/${l.id}`) })),
      ...Object.values(data.filters).sort(byOrder).filter((f) => norm(f.name).includes(query))
        .map((f) => ({ id: f.id, group: 'Filters', icon: <span className="nav-hash">≡</span>, label: f.name, run: go(`/filter/${f.id}`) })),
    ]
    const asFilter: Item[] = !validateFilter(q)
      ? [{ id: 'q-filter', group: 'Query', icon: <FilterIcon size={16} />, label: `Show tasks matching “${q.trim()}”`, run: go(`/search?q=${encodeURIComponent(q.trim())}`) }]
      : [{ id: 'q-text', group: 'Query', icon: <SearchIcon size={16} />, label: `Search all tasks for “${q.trim()}”`, run: go(`/search?q=${encodeURIComponent(`search: ${q.trim()}`)}`) }]
    const themes: Item[] = THEMES.filter((t) => norm(`theme ${t.name} ${t.group}`).includes(query)).slice(0, 8).map((t) => ({
      id: `theme-${t.id}`, group: 'Themes', icon: <Palette size={16} />, label: `Theme: ${t.name}`, hint: t.group,
      run: () => (usePrefs.getState().set({ theme: t.id }), close()),
    }))
    return [...tasks, ...places, ...asFilter, ...themes, ...commands.filter((c) => norm(c.label).includes(query))]
  }, [q, data, navigate, close, open])

  const current = Math.min(active, items.length - 1)
  let lastGroup = ''

  return (
    <Modal onClose={close} label="Search" align="top">
      <div
        className="palette"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter') items[current]?.run()
          else return
          e.preventDefault()
        }}
      >
        <div className="palette-input">
          <SearchIcon size={18} />
          <input
            autoFocus
            value={q}
            placeholder="Search tasks, projects, labels, or type a filter like “p1 & today”"
            aria-label="Search"
            aria-controls="palette-list"
            aria-activedescendant={items[current] ? `pi-${items[current].id}` : undefined}
            onChange={(e) => (setQ(e.target.value), setActive(0))}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox">
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? (lastGroup = item.group) : null
            return (
              <div key={item.id}>
                {head && <div className="palette-group label">{head}</div>}
                <button
                  id={`pi-${item.id}`}
                  role="option"
                  aria-selected={i === current}
                  className="palette-item"
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint micro">{item.hint}</span>}
                  {i === current && <ArrowRight size={14} className="palette-go" />}
                </button>
              </div>
            )
          })}
          {items.length === 0 && <p className="menu-note">No matches.</p>}
        </div>
      </div>
    </Modal>
  )
}

export function ShortcutsDialog() {
  const close = useUI((s) => s.close)
  return (
    <Modal onClose={close} label="Keyboard shortcuts" size="sm">
      <div className="form">
        <h2 className="form-title">Keyboard shortcuts.</h2>
        <dl className="keys">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="keys-row">
              <dt>{k.split(' ').map((part, i) => (part === 'then' || part === '+' ? <span key={i} className="micro"> {part} </span> : <kbd key={i}>{part}</kbd>))}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}
