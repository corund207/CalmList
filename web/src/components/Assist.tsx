import { Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { aiByline, aiContext } from '../ai/context'
import { assist, ASSIST_LABELS, type AssistMode } from '../ai/features'
import type { Task } from '../lib/types'
import { addComment, addTask, updateTask } from '../store/actions'
import { usePrefs } from '../store/prefs'
import { useUI } from '../store/ui'

/** Task Assist: break a task down, sharpen its name, or get tips. Results are suggestions until applied. */
export function Assist({ task }: { task: Task }) {
  const provider = usePrefs((s) => s.ai.provider)
  const { open, toast } = useUI()
  const [mode, setMode] = useState<AssistMode | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const run = async (m: AssistMode) => {
    setMode(m)
    setItems([])
    setError('')
    setBusy(true)
    try {
      const out = await assist(m, task, aiContext((t, f) => setStatus(f !== undefined ? `${t} ${Math.round(f * 100)}%` : t)))
      setItems(out)
      setPicked(new Set(out.map((_, i) => i)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const toggle = (i: number) => setPicked((p) => (p.has(i) ? (p.delete(i), new Set(p)) : new Set(p.add(i))))
  const done = () => (setMode(null), setItems([]))

  if (provider === 'rules')
    return (
      <div className="assist is-off">
        <Sparkles size={14} />
        <span>Task Assist needs a model. A free in-browser or Ollama model works.</span>
        <button className="link" onClick={() => open({ type: 'settings' })}>Set up AI</button>
      </div>
    )

  return (
    <section className="assist" aria-label="Task Assist">
      <div className="assist-modes">
        <Sparkles size={14} />
        {(Object.keys(ASSIST_LABELS) as AssistMode[]).map((m) => (
          <button key={m} className="chip" data-active={mode === m || undefined} disabled={busy} onClick={() => run(m)}>{ASSIST_LABELS[m]}</button>
        ))}
      </div>
      {busy && <p className="assist-status micro"><Loader2 size={12} className="spin" /> {status || 'Thinking…'}</p>}
      {error && <p className="form-hint" data-error>{error}</p>}
      {items.length > 0 && mode && (
        <div className="assist-result">
          {mode === 'actionable' ? (
            <ul className="assist-list">
              {items.map((t, i) => (
                <li key={i}>
                  <button className="assist-option" onClick={() => (updateTask(task.id, { content: t }), toast('Task renamed'), done())}>{t}</button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="assist-list">
              {items.map((t, i) => (
                <li key={i}>
                  <label className="assist-pick">
                    <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} /> {t}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="assist-foot">
            <span className="micro">AI suggestion · {aiByline()}</span>
            {mode === 'breakdown' && (
              <button className="btn btn-primary btn-sm" disabled={!picked.size} onClick={() => {
                items.filter((_, i) => picked.has(i)).forEach((content) => addTask({ content, projectId: task.projectId, sectionId: task.sectionId, parentId: task.id, ai: true }))
                toast(`Added ${picked.size} sub-task${picked.size === 1 ? '' : 's'}`)
                done()
              }}>Add as Sub-tasks</button>
            )}
            {mode === 'tips' && (
              <button className="btn btn-secondary btn-sm" disabled={!picked.size} onClick={() => {
                addComment(task.id, `Tips (AI):\n${items.filter((_, i) => picked.has(i)).map((t) => `• ${t}`).join('\n')}`)
                toast('Saved as a comment')
                done()
              }}>Save as Comment</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={done}>Dismiss</button>
          </div>
        </div>
      )}
    </section>
  )
}
