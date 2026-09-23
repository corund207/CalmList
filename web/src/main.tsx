import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ padding: 48, fontFamily: 'var(--font-sans)' }}>CalmList.</main>
  </StrictMode>,
)
