import { CalendarDays, Database, ListChecks, Server, Upload } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { toICS } from '../lib/ics'
import { parseTodoistCSV } from '../lib/todoist'
import { importTodoistProject } from '../store/importers'
import { usePrefs } from '../store/prefs'
import { PROVIDER_NAMES } from '../store/providers'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'

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

      <Card icon={<CalendarDays size={18} />} title="Google, Apple & Outlook Calendar">
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
