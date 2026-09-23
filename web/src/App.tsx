import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { useTheme } from './hooks'
import { boot, useStore } from './store/store'
import { Inbox, ProjectView } from './views/ProjectView'
import { Today } from './views/Today'
import { Upcoming } from './views/Upcoming'

export function App() {
  useTheme()
  const ready = useStore((s) => s.ready)
  useEffect(() => void boot(), [])

  return (
    <HashRouter>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <div className="app">
        <Sidebar />
        <main id="main" className="main" tabIndex={-1}>
          {ready && (
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/today" element={<Today />} />
              <Route path="/upcoming" element={<Upcoming />} />
              <Route path="/project/:id" element={<ProjectView />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </HashRouter>
  )
}
