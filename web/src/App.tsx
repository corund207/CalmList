import { useEffect } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { Dialogs } from './components/Dialogs'
import { TaskDetailHost } from './components/TaskDetail'
import { useShortcuts } from './components/Shortcuts'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { useTheme } from './hooks'
import { boot, useStore } from './store/store'
import { Inbox, ProjectView } from './views/ProjectView'
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
          <Route path="/task/:id" element={<TaskLink />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
