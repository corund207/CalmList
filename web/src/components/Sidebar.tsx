import { CalendarDays, CalendarRange, CircleCheck, Inbox, LayoutGrid, Mic, PanelLeftClose, Plus, Search, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useData } from '../hooks'
import { today } from '../lib/dates'
import { byOrder, completedToday, countOpen, openTasks, overdueTasks, projectsSorted } from '../lib/select'
import { usePrefs } from '../store/prefs'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { SortableList } from './Sortable'
import { reorder } from '../store/actions'

const SYNC_LABEL = { local: 'On this device', synced: 'Synced', syncing: 'Syncing', offline: 'Offline', error: 'Sync error' }

export function GoalRing({ done, goal, size = 18 }: { done: number; goal: number; size?: number }) {
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <svg className="goal-ring" width={size} height={size} aria-hidden="true">
      <circle className="track" cx={size / 2} cy={size / 2} r={r} />
      <circle className="value" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, done / Math.max(goal, 1)))} />
    </svg>
  )
}

export function Sidebar() {
  const data = useData()
  const status = useStore((s) => s.status)
  const { sidebar, dailyGoal, set } = usePrefs()
  const open = useUI((s) => s.open)

  const counts = useMemo(() => {
    const t = today()
    const inbox = Object.values(data.projects).find((p) => p.inbox)
    return {
      inbox: inbox ? countOpen(data, inbox.id) : 0,
      today: openTasks(data).filter((x) => x.due?.date === t).length + overdueTasks(data).length,
      done: completedToday(data),
    }
  }, [data])

  const projects = projectsSorted(data)
  const favorites = [
    ...projects.filter((p) => p.favorite).map((p) => ({ to: `/project/${p.id}`, name: p.name, id: p.id, sigil: '#' })),
    ...Object.values(data.labels).filter((l) => l.favorite).sort(byOrder).map((l) => ({ to: `/label/${l.id}`, name: l.name, id: l.id, sigil: '@' })),
    ...Object.values(data.filters).filter((f) => f.favorite).sort(byOrder).map((f) => ({ to: `/filter/${f.id}`, name: f.name, id: f.id, sigil: '≡' })),
  ]
  const archived = Object.values(data.projects).filter((p) => p.archived).sort(byOrder)
  const [showArchived, setShowArchived] = useState(false)
  const closeOnMobile = () => window.innerWidth <= 760 && set({ sidebar: false })

  return (
    <>
      <aside className="sidebar" data-open={sidebar} aria-label="Sidebar" aria-hidden={!sidebar}>
        <div className="sidebar-inner" onClick={(e) => (e.target as HTMLElement).closest('a') && closeOnMobile()}>
          <div className="sidebar-top">
            <span className="brand">CalmList</span>
            <button className="icon-btn" onClick={() => open({ type: 'search' })} aria-label="Search" title="Search  /">
              <Search size={18} />
            </button>
            <button className="icon-btn" onClick={() => open({ type: 'settings' })} aria-label="Settings" title="Settings">
              <Settings size={18} />
            </button>
            <button className="icon-btn" onClick={() => set({ sidebar: false })} aria-label="Close sidebar" title="Toggle sidebar  M">
              <PanelLeftClose size={18} />
            </button>
          </div>

          <nav className="sidebar-scroll">
            <button className="add-task-link" onClick={() => open({ type: 'quickAdd' })}>
              <span className="plus"><Plus size={16} strokeWidth={2.5} /></span>
              Add task
            </button>
            <button className="nav-item is-action" onClick={() => open({ type: 'ramble' })} title="Ramble  R">
              <Mic size={18} /><span className="name">Ramble</span>
            </button>
            <NavLink className="nav-item" to="/inbox"><Inbox size={18} /><span className="name">Inbox</span><span className="count">{counts.inbox || ''}</span></NavLink>
            <NavLink className="nav-item" to="/today"><CalendarDays size={18} /><span className="name">Today</span><span className="count">{counts.today || ''}</span></NavLink>
            <NavLink className="nav-item" to="/upcoming"><CalendarRange size={18} /><span className="name">Upcoming</span></NavLink>
            <NavLink className="nav-item" to="/filters-labels"><LayoutGrid size={18} /><span className="name">Filters &amp; Labels</span></NavLink>
            <NavLink className="nav-item" to="/completed"><CircleCheck size={18} /><span className="name">Completed</span></NavLink>

            {favorites.length > 0 && (
              <div className="nav-group">
                <div className="nav-group-head"><span className="label">Favorites</span></div>
                {favorites.map((f) => (
                  <NavLink key={f.id} className="nav-item" to={f.to}><span className="nav-hash">{f.sigil}</span><span className="name">{f.name}</span></NavLink>
                ))}
              </div>
            )}

            <div className="nav-group">
              <div className="nav-group-head">
                <span className="label">My Projects</span>
                <button className="icon-btn" onClick={() => open({ type: 'project' })} aria-label="Add project" title="Add project">
                  <Plus size={16} />
                </button>
              </div>
              <SortableList ids={projects.map((p) => p.id)} onReorder={(ids) => reorder('projects', ids)}>
                {(id) => {
                  const p = data.projects[id]
                  return (
                    <NavLink className="nav-item" to={`/project/${p.id}`}>
                      <span className="nav-hash">#</span>
                      <span className="name">{p.name}</span>
                      <span className="count">{countOpen(data, p.id) || ''}</span>
                    </NavLink>
                  )
                }}
              </SortableList>
              {archived.length > 0 && (
                <>
                  <button className="nav-item is-quiet" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                    <span className="nav-hash">·</span>
                    <span className="name">{showArchived ? 'Hide' : 'Show'} archived ({archived.length})</span>
                  </button>
                  {showArchived && archived.map((p) => (
                    <NavLink key={p.id} className="nav-item is-quiet" to={`/project/${p.id}`}><span className="nav-hash">#</span><span className="name">{p.name}</span></NavLink>
                  ))}
                </>
              )}
            </div>
          </nav>

          <div className="sidebar-foot">
            <span className="micro"><span className="sync-dot" data-status={status} />{SYNC_LABEL[status]}</span>
            <span className="goal micro" title={`Daily goal: ${counts.done} of ${dailyGoal} tasks`}>
              <GoalRing done={counts.done} goal={dailyGoal} />
              {counts.done}/{dailyGoal}
            </span>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => set({ sidebar: false })} />
    </>
  )
}
