import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { Dialogs } from './components/Dialogs'
import { TaskDetailHost } from './components/TaskDetail'
import { useShortcuts } from './components/Shortcuts'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { useTheme } from './hooks'
import { useUI } from './store/ui'
import { boot, useStore } from './store/store'
import { Inbox, ProjectView } from './views/ProjectView'
import { FilterView, FiltersLabels, LabelView } from './views/FiltersLabels'
import { Completed } from './views/Completed'
import { SearchView } from './views/SearchView'
import { Today } from './views/Today'
import { Upcoming } from './views/Upcoming'

function Layout() {
  useShortcuts()
  const ready = useStore((s) => s.ready)
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <div className="app">
        <Sidebar />
        <main id="main" className="main" tabIndex={-1}>
          {ready && <Outlet />}
        </main>
      </div>
      <button className="fab" aria-label="Add task" onClick={() => useUI.getState().open({ type: 'quickAdd' })}><Plus size={26} /></button>
      {ready && <TaskDetailHost />}
      <Dialogs />
      <Toasts />
    </>
  )
}

/** Shared task links (#/task/:id) open the task over its project. */
function TaskLink() {
  const { id = '' } = useParams()
  const task = useStore((s) => s.data.tasks[id])
  return <Navigate to={task ? `/project/${task.projectId}?task=${id}` : '/today'} replace />
}

export function App() {
  useTheme()
  useEffect(() => void boot(), [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/today" element={<Today />} />
          <Route path="/upcoming" element={<Upcoming />} />
          <Route path="/project/:id" element={<ProjectView />} />
          <Route path="/filters-labels" element={<FiltersLabels />} />
          <Route path="/label/:id" element={<LabelView />} />
          <Route path="/filter/:id" element={<FilterView />} />
          <Route path="/completed" element={<Completed />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/task/:id" element={<TaskLink />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
