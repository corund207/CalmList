import { Loader2, Mic, Square, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { aiByline, aiContext, workspace } from '../ai/context'
import { ramble, rambleWithRules, type Draft } from '../ai/features'
import { browserSpeechAvailable, listenWithBrowser, recordForWhisper, type Listener } from '../ai/speech'
import { formatDue } from '../lib/dates'
import { parseDate } from '../lib/parse'
import type { Priority } from '../lib/types'
import { addLabel, addTask, inboxId } from '../store/actions'
import { usePrefs } from '../store/prefs'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { Modal } from './Modal'

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking'

/** Speak or type a brain dump; CalmList turns it into tasks you review before adding. */
export function RambleDialog() {
  const { close, toast, open } = useUI()
  const { ai, speech, whisperModel } = usePrefs()
  const data = useStore((s) => s.data)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [drafts, setDrafts] = useState<(Draft & { keep: boolean })[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const listener = useRef<Listener | null>(null)
  const recorder = useRef<{ stop(): Promise<string> } | null>(null)
  const local = ai.provider === 'rules'

  // With the built-in rules, tasks appear live as you speak or type.
  useEffect(() => {
    if (local) setDrafts(rambleWithRules(`${text} ${interim}`, workspace()).map((d) => ({ ...d, keep: true })))
  }, [text, interim, local])

  useEffect(() => () => listener.current?.stop(), [])

  const extract = async (source = text) => {
    if (local || !source.trim()) return
    setPhase('thinking')
    setError('')
    try {
      const out = await ramble(source, workspace(), aiContext((t, f) => setStatus(f !== undefined ? `${t} ${Math.round(f * 100)}%` : t)))
      setDrafts(out.map((d) => ({ ...d, keep: true })))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPhase('idle')
      setStatus('')
    }
  }

  const start = async () => {
    setError('')
    try {
      if (speech === 'whisper' || !browserSpeechAvailable()) {
        recorder.current = await recordForWhisper(whisperModel, { onProgress: (t, f) => setStatus(f !== undefined ? `${t} ${Math.round(f * 100)}%` : t) })
        setPhase('listening')
      } else {
        const base = text ? `${text.trim()} ` : ''
        listener.current = listenWithBrowser({
          onText: (final, live) => (setText(base + final), setInterim(live)),
          onEnd: () => setInterim(''),
          onError: (m) => setError(m),
        })
        setPhase('listening')
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const stop = async () => {
    if (listener.current) {
      listener.current.stop()
      listener.current = null
      setPhase('idle')
      void extract(`${text} ${interim}`.trim())
      return
    }
    if (recorder.current) {
      setPhase('transcribing')
      try {
        const heard = await recorder.current.stop()
        const next = [text, heard].filter(Boolean).join(' ')
        setText(next)
        setPhase('idle')
        void extract(next)
      } catch (e) {
        setError((e as Error).message)
        setPhase('idle')
      } finally {
        recorder.current = null
        setStatus('')
      }
    }
  }

  const update = (i: number, patch: Partial<Draft & { keep: boolean }>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const kept = drafts.filter((d) => d.keep && d.content.trim())
  const projects = Object.values(data.projects).filter((p) => !p.archived)

  const addAll = () => {
    for (const d of kept) {
      const project = projects.find((p) => (p.inbox ? 'Inbox' : p.name) === d.project)
      addTask({
        content: d.content.trim(),
        description: d.description,
        due: d.due,
        priority: d.priority,
        projectId: project?.id ?? inboxId(),
        labels: d.labels.map((l) => addLabel(l).id),
        ai: !local,
      })
    }
    toast(`Added ${kept.length} task${kept.length === 1 ? '' : 's'} from your Ramble`)
    close()
  }

  const listening = phase === 'listening'

  return (
    <Modal onClose={close} label="Ramble" size="lg" align="top">
      <div className="ramble">
        <header className="ramble-head">
          <div>
            <p className="label">Ramble</p>
            <h2 className="form-title">Say it all. Sort it later.</h2>
          </div>
          <button
            className="mic"
            data-live={listening || undefined}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            onClick={listening ? stop : start}
            disabled={phase === 'transcribing' || phase === 'thinking'}
          >
            {phase === 'transcribing' || phase === 'thinking' ? <Loader2 size={26} className="spin" /> : listening ? <Square size={22} /> : <Mic size={26} />}
          </button>
        </header>

        <textarea
          className="field ramble-text"
          rows={4}
          placeholder="Tap the mic and talk, or type: “Need to call the dentist tomorrow at 3, pick up dry cleaning, and send Sam the report by Friday — that one's urgent.”"
          value={interim ? `${text} ${interim}` : text}
          onChange={(e) => setText(e.target.value)}
          readOnly={listening}
          aria-label="What you said"
        />
        <div className="ramble-bar">
          <span className="micro">{status || (listening ? (speech === 'whisper' ? 'Recording · transcribed on this device when you stop' : 'Listening…') : aiByline())}</span>
          {!local && (
            <button className="btn btn-secondary btn-sm" disabled={!text.trim() || phase !== 'idle'} onClick={() => extract()}>
              <Sparkles size={14} /> Find Tasks
            </button>
          )}
        </div>
        {error && <p className="form-hint" data-error>{error} <button className="link" onClick={() => open({ type: 'settings' })}>AI settings</button></p>}

        {drafts.length > 0 && (
          <ul className="drafts" aria-label="Tasks found">
            {drafts.map((d, i) => (
              <li key={i} className="draft" data-off={!d.keep || undefined}>
                <input type="checkbox" checked={d.keep} onChange={(e) => update(i, { keep: e.target.checked })} aria-label={`Keep “${d.content}”`} />
                <div className="draft-main">
                  <input className="draft-title" value={d.content} onChange={(e) => update(i, { content: e.target.value })} aria-label="Task name" />
                  <div className="draft-meta">
                    <input
                      className="draft-when"
                      value={d.dueText}
                      placeholder="No date"
                      aria-label="When"
                      onChange={(e) => update(i, { dueText: e.target.value, due: parseDate(e.target.value)?.due ?? null })}
                    />
                    {d.due && <span className="micro">{formatDue(d.due)}</span>}
                    <select value={d.priority} onChange={(e) => update(i, { priority: Number(e.target.value) as Priority })} aria-label="Priority">
                      {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
                    </select>
                    <select value={d.project ?? 'Inbox'} onChange={(e) => update(i, { project: e.target.value })} aria-label="Project">
                      {projects.map((p) => <option key={p.id}>{p.inbox ? 'Inbox' : p.name}</option>)}
                    </select>
                    {d.labels.map((l) => <span key={l} className="meta is-label">@{l}</span>)}
                  </div>
                </div>
                <button className="icon-btn" aria-label="Remove" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}

        <footer className="form-actions">
          {!local && <span className="ai-note micro">AI suggestions · check before adding</span>}
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={!kept.length || phase !== 'idle'} onClick={addAll}>
            Add {kept.length || ''} Task{kept.length === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
