import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isNative, routeExternalLinks } from './lib/platform'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/tasks.css'
import './styles/backdrops.css'
import './styles/calendar.css'
import './styles/motion.css'

routeExternalLinks()

// Offline start for the installed web app (Add to Home Screen, Install app). The native shell has its files on disk.
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
