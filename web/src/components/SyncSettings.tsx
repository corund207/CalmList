import { Check, Cloud, Copy, Database, ExternalLink, HardDrive, LogOut, Server, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import setupSql from '../../../supabase/migrations/20260923000000_calmlist.sql?raw'
import { deleteAccount, requestPasswordReset, updateName, updatePassword } from '../store/account'
import { authenticate, signOut } from '../store/auth'
import { usePrefs } from '../store/prefs'
import { PRESETS, PROVIDER_NAMES, testConnection, type ProviderConfig } from '../store/providers'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'

type Kind = ProviderConfig['kind']

const OPTIONS: [Kind, string, string, ReactNode][] = [
  ['local', 'This device', 'Private and offline. Nothing leaves this browser.', <HardDrive size={18} key="l" />],
  ['supabase', 'Supabase', 'Supabase Cloud, or your own self-hosted Supabase. Live sync.', <Database size={18} key="s" />],
  ['calmlist', 'CalmList server', 'The bundled Node + SQLite server, on your own box.', <Server size={18} key="c" />],
]

/** Supabase dashboard link for a hosted project; self-hosted Studio lives on the same host. */
const sqlEditor = (url: string) => {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url.trim())?.[1]
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : url.trim() ? `${url.trim().replace(/\/+$/, '')}/project/default/sql/1` : 'https://supabase.com/dashboard'
}

function SupabaseSetup({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <details className="setup">
      <summary>First time? Set up a Supabase project in three steps</summary>
      <ol>
        <li>
          Create a project at <a className="link" href="https://supabase.com/dashboard/new" target="_blank" rel="noopener">supabase.com <ExternalLink size={12} /></a>,
          or run <code>npm run supabase:selfhost</code> from the CalmList repo to start your own.
        </li>
        <li>
          Open the{' '}
          <a className="link" href={sqlEditor(url)} target="_blank" rel="noopener">SQL editor <ExternalLink size={12} /></a>,
          paste the setup SQL and run it. It creates one table with row-level security and live updates.
          <div className="actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(setupSql).then(() => setCopied(true))}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Setup SQL'}
            </button>
          </div>
        </li>
        <li>From Project Settings → API, paste the project URL and the <strong>anon public</strong> key below. Never use the service role key here.</li>
      </ol>
    </details>
  )
}

export function SyncSettings() {
  const { session, provider: saved } = usePrefs()
  const status = useStore((s) => s.status)
  const toast = useUI((s) => s.toast)
  const [kind, setKind] = useState<Kind>(saved.kind === 'local' && PRESETS.supabaseUrl ? 'supabase' : saved.kind)
  const [supabaseUrl, setSupabaseUrl] = useState(saved.kind === 'supabase' ? saved.url : PRESETS.supabaseUrl)
  const [anonKey, setAnonKey] = useState(saved.kind === 'supabase' ? saved.anonKey : PRESETS.supabaseAnonKey)
  const [serverUrl, setServerUrl] = useState(saved.kind === 'calmlist' ? saved.url : PRESETS.calmlistUrl)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [bringLocal, setBringLocal] = useState<boolean | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const provider: ProviderConfig =
    kind === 'supabase' ? { kind, url: supabaseUrl.trim(), anonKey: anonKey.trim() } : kind === 'calmlist' ? { kind, url: serverUrl.trim() } : { kind: 'local' }

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const text = await fn()
      if (text) setMessage({ ok: true, text })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (session)
    return (
      <div className="settings-pane">
        <div className="account-card">
          <span className="micro">Syncing with {PROVIDER_NAMES[saved.kind]}</span>
          <strong>{session.user.name}</strong>
          <span>{session.user.email}</span>
          <span className="micro">{saved.kind === 'local' ? '' : saved.url || location.origin} · {status}</span>
        </div>
        <button className="btn btn-secondary" onClick={() => signOut().then(() => toast('Signed out. Back to this device only.'))}><LogOut size={15} /> Sign Out</button>
        <AccountDetails />
      </div>
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await authenticate(provider, mode, { email, password, name }, bringLocal ?? mode === 'signup')
      toast(mode === 'signup' ? 'Account created. Syncing is on.' : 'Signed in. Syncing is on.')
    })
  }

  return (
    <form className="settings-pane" onSubmit={submit}>
      <div className="provider-grid" role="radiogroup" aria-label="Where your tasks live">
        {OPTIONS.map(([id, label, blurb, icon]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} className="provider" onClick={() => (setKind(id), setMessage(null))}>
            <span className="provider-icon">{icon}</span>
            <strong>{label}</strong>
            <span>{blurb}</span>
          </button>
        ))}
      </div>

      {kind === 'local' && (
        <p className="form-body"><Cloud size={15} className="inline-icon" /> Everything already lives in this browser. Pick a service above to sync across devices.</p>
      )}

      {kind === 'supabase' && (
        <>
          <SupabaseSetup url={supabaseUrl} />
          <label className="form-field">
            <span className="micro">Project URL</span>
            <input className="field" value={supabaseUrl} placeholder="https://your-project.supabase.co or http://your-server:8000" onChange={(e) => setSupabaseUrl(e.target.value)} />
          </label>
          <label className="form-field">
            <span className="micro">Anon public key</span>
            <input className="field is-mono" value={anonKey} placeholder="eyJhbGciOi…" onChange={(e) => setAnonKey(e.target.value)} />
          </label>
        </>
      )}

      {kind === 'calmlist' && (
        <label className="form-field">
          <span className="micro">Server</span>
          <input className="field" value={serverUrl} placeholder={`${location.origin} (this site)`} onChange={(e) => setServerUrl(e.target.value)} />
          <span className="form-hint">Run it with Docker or <code>npm start</code>. Set <code>CORS_ORIGIN</code> to this site's address.</span>
        </label>
      )}

      {kind !== 'local' && (
        <>
          <div className="actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => testConnection(provider))}>Test Connection</button>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Account">
            <button type="button" role="radio" aria-checked={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
            <button type="button" role="radio" aria-checked={mode === 'signup'} onClick={() => setMode('signup')}>Create account</button>
          </div>
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
          {mode === 'login' && kind === 'supabase' && (
            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => run(async () => {
                  if (!email) throw new Error('Enter your email above first.')
                  await requestPasswordReset(email)
                  return `If ${email} has an account, a reset link is on its way.`
                })}
              >
                Forgot password?
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <label className="toggle">
              <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span>
                I'm 16 or older
                {PRESETS.policyUrl && (
                  <> and agree to the <a className="link" href={`${PRESETS.policyUrl}#terms`} target="_blank" rel="noopener">Terms</a> and{' '}
                  <a className="link" href={`${PRESETS.policyUrl}#privacy`} target="_blank" rel="noopener">Privacy Policy</a></>
                )}
              </span>
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={bringLocal ?? mode === 'signup'} onChange={(e) => setBringLocal(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true" />
            Bring the tasks on this device into the account
          </label>
        </>
      )}

      {message && <p className="form-hint" data-error={!message.ok || undefined} data-ok={message.ok || undefined}>{message.text}</p>}
      {kind !== 'local' && (
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || (mode === 'signup' && !agreed)}>{busy ? 'Connecting…' : mode === 'signup' ? 'Create Account' : 'Sign In'}</button>
        </div>
      )}
    </form>
  )
}

/** Name, password and deletion for the signed-in account. */
function AccountDetails() {
  const { session, provider } = usePrefs()
  const { toast, open } = useUI()
  const [name, setName] = useState(session?.user.name ?? '')
  const [password, setPassword] = useState('')
  const [keepCopy, setKeepCopy] = useState(true)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!session) return null
  const managed = provider.kind === 'supabase'

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ ok: true, text: await fn() })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = () =>
    open({
      type: 'confirm',
      title: 'Delete your account?',
      body: `This permanently deletes ${session.user.email} and every task, project and label synced with it. It can't be undone.${keepCopy ? ' A copy stays on this device.' : ''}`,
      action: 'Delete Account',
      onConfirm: () =>
        void deleteAccount(keepCopy)
          .then(() => toast(keepCopy ? 'Account deleted. Your tasks stay on this device.' : 'Account deleted.'))
          .catch((err: Error) => toast(`Couldn't delete the account: ${err.message}`)),
    })

  return (
    <>
      {managed && (
        <>
          <form className="form-field" onSubmit={(e) => (e.preventDefault(), void run(() => updateName(name.trim()).then(() => 'Name saved.')))}>
            <span className="micro">Name</span>
            <div className="actions">
              <input className="field" value={name} autoComplete="name" required onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={busy || !name.trim() || name.trim() === session.user.name}>Save</button>
            </div>
          </form>
          <form
            className="form-field"
            onSubmit={(e) => (e.preventDefault(), void run(() => updatePassword(password).then(() => (setPassword(''), 'Password changed.'))))}
          >
            <span className="micro">New password</span>
            <div className="actions">
              <input className="field" type="password" minLength={8} required value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={busy || password.length < 8}>Change</button>
            </div>
          </form>
        </>
      )}
      {message && <p className="form-hint" data-error={!message.ok || undefined} data-ok={message.ok || undefined}>{message.text}</p>}
      <label className="toggle">
        <input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        Keep a copy of my tasks on this device after deleting
      </label>
      <div className="actions">
        <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}><Trash2 size={15} /> Delete Account</button>
      </div>
    </>
  )
}
