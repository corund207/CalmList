import { CalendarDays, CalendarSync, Database, ListChecks, RefreshCw, Server, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toICS } from '../lib/ics'
import { parseTodoistCSV } from '../lib/todoist'
import { calendarLinked, connectCalendar, disconnectCalendar, syncCalendar, useGcal } from '../store/gcal'
import { importTodoistProject } from '../store/importers'
import { usePrefs } from '../store/prefs'
import { PRESETS, PROVIDER_NAMES } from '../store/providers'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { AgentConnect } from './AgentConnect'

function Card({ icon, title, status, children }: { icon: ReactNode; title: string; status?: string; children: ReactNode }) {
  return (
    <section className="integration">
      <header>
        <span className="provider-icon">{icon}</span>
        <strong>{title}</strong>
        {status && <span className="micro integration-status">{status}</span>}
      </header>
      {children}
    </section>
  )
}

const download = (name: string, text: string, type: string) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Keeps a "CalmList" calendar in the person's Google account in step with their dated tasks. */
function GoogleCalendar({ dated }: { dated: number }) {
  const { connected, expired, busy, lastSync, error } = useGcal()
  const { toast, open } = useUI()
  const [problem, setProblem] = useState<string | null>(null)
  const linked = connected || expired || calendarLinked()
  const go = (fn: () => Promise<void>) => fn().then(() => setProblem(null), (e: Error) => setProblem(e.message))

  return (
    <Card icon={<CalendarSync size={18} />} title="Google Calendar" status={connected ? 'Connected' : expired ? 'Paused' : undefined}>
      <p>
        Adds your {dated} dated task{dated === 1 ? '' : 's'} to a separate calendar called <strong>CalmList</strong> and keeps it up to date as you work.
        Only tasks with a date or time are added. CalmList can only see calendars it created, never your others.
      </p>
      {!PRESETS.googleClientId ? (
        <p className="form-hint">This copy of CalmList has no Google client id. Set <code>VITE_GOOGLE_CLIENT_ID</code> (see the README) to turn it on.</p>
      ) : !linked ? (
        <div className="actions"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => go(connectCalendar)}>Connect Google Calendar</button></div>
      ) : (
        <div className="actions">
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => go(connected ? syncCalendar : connectCalendar)}>
            <RefreshCw size={14} /> {busy ? 'Syncing…' : connected ? 'Sync Now' : 'Resume Sync'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => open({
              type: 'confirm',
              title: 'Disconnect Google Calendar?',
              body: 'CalmList stops updating the calendar and deletes the CalmList calendar from your Google account. Your tasks stay here.',
              action: 'Disconnect',
              onConfirm: () => void disconnectCalendar(true).then(() => toast('Google Calendar disconnected.'), (e: Error) => toast(e.message)),
            })}
          >
            Disconnect
          </button>
        </div>
      )}
      {expired && !connected && <p className="form-hint">Google access lasts an hour at a time. Resume to catch up on changes.</p>}
      {(problem || error) && <p className="form-hint" data-error>{problem ?? error}</p>}
      {connected && lastSync && !error && <p className="form-hint">Last synced {new Date(lastSync).toLocaleTimeString()}.</p>}
    </Card>
  )
}

export function Integrations({ onOpenSync }: { onOpenSync(): void }) {
  const data = useStore((s) => s.data)
  const provider = usePrefs((s) => s.provider)
  const toast = useUI((s) => s.toast)
  const file = useRef<HTMLInputElement>(null)
  const dated = Object.values(data.tasks).filter((t) => t.due && !t.completed).length

  const importFiles = async (files: FileList) => {
    let tasks = 0
    for (const f of Array.from(files)) {
      try {
        const project = parseTodoistCSV(await f.text(), f.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported')
        importTodoistProject(project)
        tasks += project.tasks.length
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`)
      }
    }
    if (tasks) toast(`Imported ${tasks} task${tasks === 1 ? '' : 's'} from Todoist`)
  }

  return (
    <div className="settings-pane integrations">
      <Card icon={<Database size={18} />} title="Supabase" status={provider.kind === 'supabase' ? 'Connected' : undefined}>
        <p>Sync through Supabase Cloud or a self-hosted Supabase, with live updates between devices.</p>
        <div className="actions"><button className="btn btn-secondary btn-sm" onClick={onOpenSync}>Set Up Sync</button></div>
      </Card>

      <Card icon={<Server size={18} />} title="CalmList server" status={provider.kind === 'calmlist' ? 'Connected' : undefined}>
        <p>The bundled Node + SQLite server for a single box, a Raspberry Pi or any container host.</p>
        <div className="actions"><button className="btn btn-secondary btn-sm" onClick={onOpenSync}>Set Up Sync</button></div>
      </Card>

      <AgentConnect onOpenSync={onOpenSync} />

      <GoogleCalendar dated={dated} />

      <Card icon={<CalendarDays size={18} />} title="Apple, Outlook & other calendars">
        <p>Download your {dated} dated task{dated === 1 ? '' : 's'} as an .ics file, including repeats, then import it into any calendar app.</p>
        <div className="actions">
          <button className="btn btn-secondary btn-sm" disabled={!dated} onClick={() => download('calmlist.ics', toICS(data), 'text/calendar')}>Download .ics</button>
        </div>
      </Card>

      <Card icon={<ListChecks size={18} />} title="Todoist">
        <p>In Todoist, open a project's menu and choose <em>Export as a template → CSV</em>. Import one or many files; each becomes a project with its sections, sub-tasks, labels, dates and comments.</p>
        <div className="actions">
          <button className="btn btn-secondary btn-sm" onClick={() => file.current?.click()}><Upload size={14} /> Import Todoist CSV</button>
          <input ref={file} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => e.target.files?.length && importFiles(e.target.files).then(() => (e.target.value = ''))} />
        </div>
      </Card>

      <p className="form-hint">Currently syncing with: {PROVIDER_NAMES[provider.kind]}.</p>
    </div>
  )
}
