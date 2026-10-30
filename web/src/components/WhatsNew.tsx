import { Sparkles } from 'lucide-react'
import { RELEASES, releasesSince, VERSION } from '../releases'
import { useUI } from '../store/ui'
import { Modal } from './Modal'

const SEEN = 'calmlist:seen-version'
/** The version this device ran before the current one, so the dialog can mark what's new to it. */
let previous: string | null = null

/** After an update, shows what changed, once. A first visit shows nothing: everything is new then. */
export function checkWhatsNew(open: () => void) {
  try {
    previous = localStorage.getItem(SEEN)
    localStorage.setItem(SEEN, VERSION)
  } catch {
    return
  }
  if (previous && previous !== VERSION) open()
}

const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

export function WhatsNewDialog() {
  const close = useUI((s) => s.close)
  const fresh = new Set(releasesSince(previous ?? VERSION).map((r) => r.version))
  if (!fresh.size) fresh.add(VERSION)

  return (
    <Modal onClose={close} label="What’s new" size="md">
      <div className="whats-new">
        <header>
          <p className="label"><Sparkles size={12} /> What’s new</p>
          <h2 className="form-title">CalmList {VERSION}</h2>
        </header>
        <div className="releases">
          {RELEASES.map((r) => (
            <details key={r.version} className="release" open={fresh.has(r.version)}>
              <summary>
                <span className="release-version">{r.version}</span>
                <span className="release-title">{r.title}</span>
                <span className="micro">{formatDate(r.date)}</span>
              </summary>
              <ul>
                {r.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          ))}
        </div>
        <footer className="form-actions">
          <button className="btn btn-primary" onClick={close}>Done</button>
        </footer>
      </div>
    </Modal>
  )
}
