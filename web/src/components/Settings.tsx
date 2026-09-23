import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { emptyData, type Data } from '../lib/types'
import { importData } from '../store/actions'
import { usePrefs } from '../store/prefs'
import { PRESETS, PROVIDER_NAMES } from '../store/providers'
import { ThemePicker } from '../themes/ThemePicker'
import { AiSettings } from './AiSettings'
import { Integrations } from './Integrations'
import { SyncSettings } from './SyncSettings'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { Modal } from './Modal'

type Tab = 'appearance' | 'general' | 'ai' | 'account' | 'integrations' | 'data'

function General() {
  const { dailyGoal, set } = usePrefs()
  return (
    <div className="settings-pane">
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

  const provider = usePrefs((s) => s.provider)
  const policy = PRESETS.policyUrl && new URL(PRESETS.policyUrl, location.href)

  return (
    <div className="settings-pane">
      <p className="form-body">
        <strong>No analytics, ads or tracking.</strong> Your tasks live {provider.kind === 'local' ? 'only in this browser' : `in this browser and on your ${PROVIDER_NAMES[provider.kind]} account`}.
        Nothing else leaves this device unless you turn on a cloud AI provider, an AI assistant connection or Google Calendar.
      </p>
      {policy && (
        <nav className="legal-links" aria-label="Legal">
          <a className="link" href={`${policy.href.split('#')[0]}#privacy`} target="_blank" rel="noopener">Privacy Policy</a>
          <a className="link" href={`${policy.href.split('#')[0]}#terms`} target="_blank" rel="noopener">Terms</a>
          <a className="link" href={new URL('licenses.txt', policy).href} target="_blank" rel="noopener">Open-source licenses</a>
        </nav>
      )}
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
  const [tab, setTab] = useState<Tab>('appearance')
  const tabs: [Tab, string][] = [['appearance', 'Appearance'], ['general', 'General'], ['ai', 'AI'], ['account', 'Account & Sync'], ['integrations', 'Integrations'], ['data', 'Data & Privacy']]
  return (
    <Modal onClose={close} label="Settings" size="lg">
      <div className="form">
        <h2 className="form-title">Settings.</h2>
        <nav className="subnav" aria-label="Settings sections">
          {tabs.map(([id, label]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        {tab === 'appearance' && <ThemePicker />}
        {tab === 'general' && <General />}
        {tab === 'ai' && <AiSettings />}
        {tab === 'account' && <SyncSettings />}
        {tab === 'integrations' && <Integrations onOpenSync={() => setTab('account')} />}
        {tab === 'data' && <DataPane />}
      </div>
    </Modal>
  )
}
