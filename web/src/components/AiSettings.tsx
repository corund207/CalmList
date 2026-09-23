import { Check, Cloud, Cpu, Download, ExternalLink, HardDrive, Loader2, Server } from 'lucide-react'
import { useState } from 'react'
import { PROVIDERS, providerInfo, type AiProvider } from '../ai/config'
import { aiContext, workspace } from '../ai/context'
import { listModels, warmUp } from '../ai/engine'
import { ramble } from '../ai/features'
import { browserSpeechAvailable, WHISPER_MODELS } from '../ai/speech'
import { usePrefs } from '../store/prefs'

const ICON = { device: <HardDrive size={16} />, 'your-machine': <Server size={16} />, cloud: <Cloud size={16} /> }
const WHERE = { device: 'On this device', 'your-machine': 'Your machine', cloud: 'Cloud · your key' }

export function AiSettings() {
  const { ai, aiKeys, aiConsent, speech, whisperModel, set } = usePrefs()
  const info = providerInfo(ai.provider)
  const [models, setModels] = useState<string[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [pendingConsent, setPendingConsent] = useState<AiProvider | null>(null)

  const choose = (id: AiProvider) => {
    const p = providerInfo(id)
    if (p.where === 'cloud' && !aiConsent.includes(id)) return setPendingConsent(id)
    set({ ai: { provider: id, model: p.defaultModel, baseUrl: p.defaultBaseUrl } })
    setModels([])
    setMessage(null)
  }

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label)
    setMessage(null)
    try {
      setMessage({ ok: true, text: await fn() })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setBusy('')
      setProgress(null)
    }
  }

  const test = () =>
    run('test', async () => {
      const out = await ramble('Call Sam tomorrow at 4pm about the budget, and buy milk', workspace(), aiContext((t, f) => (f !== undefined ? setProgress(f) : null, setBusy(t.slice(0, 80)))))
      return `Working. Found ${out.length} task${out.length === 1 ? '' : 's'}: ${out.map((d) => `“${d.content}”${d.due ? ` (${d.dueText})` : ''}`).join(', ')}`
    })

  return (
    <div className="settings-pane">
      <p className="form-body">
        AI powers Ramble, Task Assist and Filter Assist. The default costs nothing and keeps everything on your device. Cloud models are optional and use your own key.
      </p>

      <div className="provider-grid is-ai" role="radiogroup" aria-label="AI model">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={ai.provider === p.id} className="provider" onClick={() => choose(p.id)}>
            <span className="provider-icon">{ICON[p.where]}</span>
            <strong>{p.name}</strong>
            <span>{WHERE[p.where]} · {p.cost}</span>
          </button>
        ))}
      </div>

      {pendingConsent && (
        <div className="consent" role="alertdialog" aria-label="Send data to a cloud AI provider?">
          <p><strong>Send text to {providerInfo(pendingConsent).name}?</strong> {providerInfo(pendingConsent).privacy} Only the text of the feature you use is sent (your Ramble, one task, or a filter description), and only when you use it.</p>
          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setPendingConsent(null)}>Keep It Local</button>
            <button className="btn btn-primary btn-sm" onClick={() => {
              set({ aiConsent: [...aiConsent, pendingConsent] })
              const p = providerInfo(pendingConsent)
              set({ ai: { provider: p.id, model: p.defaultModel, baseUrl: p.defaultBaseUrl } })
              setPendingConsent(null)
            }}>I Agree</button>
          </div>
        </div>
      )}

      <p className="form-hint">{info.privacy}</p>

      {ai.provider === 'webllm' && (
        <>
          <label className="form-field">
            <span className="micro">Model</span>
            <select className="field" value={ai.model} onChange={(e) => set({ ai: { ...ai, model: e.target.value } })}>
              {info.models!.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="actions">
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('download', async () => {
              await warmUp(ai.model, (t, f) => (setBusy(t.slice(0, 90)), f !== undefined && setProgress(f)))
              return 'Model ready. It is cached in this browser and works offline.'
            })}><Download size={14} /> Download Model</button>
          </div>
        </>
      )}

      {ai.provider !== 'rules' && ai.provider !== 'webllm' && (
        <>
          {info.defaultBaseUrl && (
            <label className="form-field">
              <span className="micro">Server URL</span>
              <input className="field" value={ai.baseUrl} placeholder={info.defaultBaseUrl} onChange={(e) => set({ ai: { ...ai, baseUrl: e.target.value } })} />
            </label>
          )}
          {info.needsKey && (
            <label className="form-field">
              <span className="micro">API key (stored only in this browser, never synced)</span>
              <input className="field is-mono" type="password" autoComplete="off" value={aiKeys[ai.provider] ?? ''} onChange={(e) => set({ aiKeys: { ...aiKeys, [ai.provider]: e.target.value.trim() } })} />
              {info.keyUrl && <a className="link micro" href={info.keyUrl} target="_blank" rel="noopener">Get a key <ExternalLink size={11} /></a>}
            </label>
          )}
          {ai.provider === 'compatible' && (
            <label className="form-field">
              <span className="micro">API key (optional)</span>
              <input className="field is-mono" type="password" autoComplete="off" value={aiKeys.compatible ?? ''} onChange={(e) => set({ aiKeys: { ...aiKeys, compatible: e.target.value.trim() } })} />
            </label>
          )}
          <label className="form-field">
            <span className="micro">Model</span>
            <div className="assist-inline">
              <input className="field" list="ai-models" value={ai.model} placeholder={info.defaultModel || 'Load the list, or type a model name'} onChange={(e) => set({ ai: { ...ai, model: e.target.value } })} />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('models', async () => {
                const list = await listModels(ai, aiKeys[ai.provider])
                setModels(list)
                return `${list.length} model${list.length === 1 ? '' : 's'} available.`
              })}>Load Models</button>
            </div>
            <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          {ai.provider === 'ollama' && (
            <p className="form-hint">
              Install from <a className="link" href="https://ollama.com" target="_blank" rel="noopener">ollama.com</a>, run <code>ollama pull qwen2.5:3b</code>, then start it with{' '}
              <code>OLLAMA_ORIGINS={location.origin}</code> so this page may call it.
            </p>
          )}
        </>
      )}

      {ai.provider !== 'rules' && (
        <div className="actions">
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={test}><Cpu size={14} /> Test With a Sample Ramble</button>
        </div>
      )}
      {busy && (
        <div className="progress" aria-live="polite">
          <span className="micro"><Loader2 size={12} className="spin" /> {busy === 'test' ? 'Asking the model…' : busy === 'models' ? 'Loading models…' : busy}</span>
          {progress !== null && <div className="progress-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        </div>
      )}
      {message && <p className="form-hint" data-ok={message.ok || undefined} data-error={!message.ok || undefined}>{message.ok && <Check size={13} />} {message.text}</p>}

      <div className="form-field">
        <span className="micro">Voice for Ramble</span>
        <div className="segmented" role="radiogroup" aria-label="Speech recognition">
          <button type="button" role="radio" aria-checked={speech === 'browser'} disabled={!browserSpeechAvailable()} onClick={() => set({ speech: 'browser' })}>Browser speech</button>
          <button type="button" role="radio" aria-checked={speech === 'whisper'} onClick={() => set({ speech: 'whisper' })}>Whisper on device</button>
        </div>
        <span className="form-hint">
          {speech === 'browser'
            ? 'Live words as you talk. In Chrome and Edge the browser sends audio to its vendor’s speech service; Safari can process it on device.'
            : 'Fully private: audio never leaves this device. The model downloads once from Hugging Face; text appears when you stop.'}
        </span>
      </div>
      {speech === 'whisper' && (
        <label className="form-field">
          <span className="micro">Whisper model</span>
          <select className="field" value={whisperModel} onChange={(e) => set({ whisperModel: e.target.value })}>
            {WHISPER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      )}
      {aiConsent.length > 0 && (
        <p className="form-hint">
          You agreed to send text to: {aiConsent.map((id) => providerInfo(id).name).join(', ')}.{' '}
          <button className="link" onClick={() => {
            set({ aiConsent: [], aiKeys: {}, ...(providerInfo(ai.provider).where === 'cloud' && { ai: { provider: 'rules', model: '', baseUrl: '' } }) })
            setMessage({ ok: true, text: 'Consent withdrawn and API keys removed from this browser.' })
          }}>Withdraw and delete keys</button>
        </p>
      )}
    </div>
  )
}
