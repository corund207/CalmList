import { Download, LogOut, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { emptyData, type Data } from '../lib/types'
import { importData } from '../store/actions'
import { authenticate, signOut } from '../store/auth'
import { usePrefs, type Theme } from '../store/prefs'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { Modal } from './Modal'

type Tab = 'general' | 'account' | 'data'

function General() {
  const { theme, dailyGoal, set } = usePrefs()
  const themes: [Theme, string, typeof Sun][] = [['system', 'System', Monitor], ['dark', 'Dark', Moon], ['light', 'Light', Sun]]
  return (
    <div className="settings-pane">
      <div className="form-field">
        <span className="micro">Theme</span>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {themes.map(([id, label, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => set({ theme: id })}><Icon size={15} /> {label}</button>
          ))}
        </div>
      </div>
      <label className="form-field">
        <span className="micro">Daily goal</span>
        <div className="goal-input">
          <input className="field" type="number" min={1} max={50} value={dailyGoal} onChange={(e) => set({ dailyGoal: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
          <span>tasks a day</span>
        </div>
      </label>
    </div>
  )
}

function Account() {
  const { session, apiUrl } = usePrefs()
  const status = useStore((s) => s.status)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [server, setServer] = useState(apiUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [bringLocal, setBringLocal] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useUI((s) => s.toast)

  if (session)
    return (
      <div className="settings-pane">
        <div className="account-card">
          <span className="micro">Signed in</span>
          <strong>{session.user.name}</strong>
          <span>{session.user.email}</span>
          <span className="micro">{apiUrl || location.origin} · {status}</span>
        </div>
        <button className="btn btn-secondary" onClick={() => signOut().then(() => toast('Signed out'))}><LogOut size={15} /> Sign Out</button>
      </div>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await authenticate(mode, server, { email, password, name }, bringLocal ?? mode === 'signup')
      toast(mode === 'signup' ? 'Account created. Syncing is on.' : 'Signed in. Syncing is on.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="settings-pane" onSubmit={submit}>
      <p className="form-body">Right now everything lives in this browser. Sign in to a CalmList server to sync across devices.</p>
      <div className="segmented" role="radiogroup" aria-label="Account">
        <button type="button" role="radio" aria-checked={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
        <button type="button" role="radio" aria-checked={mode === 'signup'} onClick={() => setMode('signup')}>Create account</button>
      </div>
      <label className="form-field">
        <span className="micro">Server</span>
        <input className="field" value={server} placeholder={`${location.origin} (this site)`} onChange={(e) => setServer(e.target.value)} />
      </label>
      {mode === 'signup' && (
        <label className="form-field">
          <span className="micro">Name</span>
          <input className="field" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="form-field">
        <span className="micro">Email</span>
        <input className="field" type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="micro">Password</span>
        <input className="field" type="password" required minLength={mode === 'signup' ? 8 : undefined} value={password} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="toggle">
        <input type="checkbox" checked={bringLocal ?? mode === 'signup'} onChange={(e) => setBringLocal(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        Bring the tasks on this device into the account
      </label>
      {error && <p className="form-hint" data-error>{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Connecting…' : mode === 'signup' ? 'Create Account' : 'Sign In'}</button>
      </div>
    </form>
  )
}

function DataPane() {
  const data = useStore((s) => s.data)
  const { open, toast } = useUI()
  const file = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'calmlist', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `calmlist-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      const incoming = (parsed.data ?? parsed) as Partial<Data>
      const known = Object.keys(emptyData())
      if (!Object.keys(incoming).some((k) => known.includes(k))) throw new Error()
      importData(Object.fromEntries(Object.entries(incoming).filter(([k]) => known.includes(k))))
      toast('Import complete')
    } catch {
      toast('That file is not a CalmList export')
    }
  }

  const counts = `${Object.keys(data.tasks).length} tasks · ${Object.keys(data.projects).length} projects · ${Object.keys(data.labels).length} labels`

  return (
    <div className="settings-pane">
      <p className="form-body">{counts}</p>
      <div className="actions">
        <button className="btn btn-secondary" onClick={exportJson}><Download size={15} /> Export JSON</button>
        <button className="btn btn-secondary" onClick={() => file.current?.click()}><Upload size={15} /> Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
      <p className="form-hint">Imports merge by id, so importing an export twice changes nothing.</p>
      {!usePrefs.getState().session && (
        <button
          className="btn btn-danger"
          onClick={() => open({
            type: 'confirm',
            title: 'Erase this device?',
            body: 'Every task, project and label stored in this browser will be deleted. Export first if you want a copy.',
            action: 'Erase',
            onConfirm: () => {
              localStorage.removeItem('calmlist:data')
              location.reload()
            },
          })}
        >
          Erase Local Data
        </button>
      )}
    </div>
  )
}

export function SettingsDialog() {
  const close = useUI((s) => s.close)
  const [tab, setTab] = useState<Tab>('general')
  const tabs: [Tab, string][] = [['general', 'General'], ['account', 'Account & Sync'], ['data', 'Data']]
  return (
    <Modal onClose={close} label="Settings">
      <div className="form">
        <h2 className="form-title">Settings.</h2>
        <nav className="subnav" aria-label="Settings sections">
          {tabs.map(([id, label]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        {tab === 'general' && <General />}
        {tab === 'account' && <Account />}
        {tab === 'data' && <DataPane />}
      </div>
    </Modal>
  )
}
