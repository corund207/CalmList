import { CalendarDays, ChevronDown, Flag, Tag, X, Crosshair } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useData } from '../hooks'
import { formatDate, formatDue } from '../lib/dates'
import { parseQuickAdd, type Token } from '../lib/parse'
import { sectionsOf } from '../lib/select'
import type { ID } from '../lib/types'
import { inboxId } from '../store/actions'
import { preview, resolve, type Draft } from '../store/quickadd'
import { DatePicker, LabelPicker, PriorityPicker, PRIORITY_NAMES, ProjectPicker } from './pickers'
import { Popover, usePopover } from './Popover'

const ZWSP = String.fromCharCode(0x200b)

/** An input that highlights recognised tokens (dates, #projects, @labels, p1) as you type. */
function SmartInput({ value, tokens, onChange, placeholder, autoFocus }: {
  value: string
  tokens: Token[]
  onChange(v: string): void
  placeholder: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const parts: { text: string; type?: string }[] = []
  let at = 0
  for (const t of tokens) {
    if (t.start > at) parts.push({ text: value.slice(at, t.start) })
    parts.push({ text: value.slice(t.start, t.end), type: t.type })
    at = t.end
  }
  parts.push({ text: value.slice(at) + ZWSP }) // keeps a trailing space measurable

  return (
    <div className="smart">
      <div className="smart-mirror" aria-hidden="true">
        {parts.map((p, i) => (p.type ? <mark key={i} data-type={p.type}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
      </div>
      <textarea
        ref={ref}
        rows={1}
        className="smart-input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Task name"
        spellCheck
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      />
    </div>
  )
}

interface Props {
  initial?: Partial<Draft>
  submitLabel?: string
  onSubmit(fields: ReturnType<typeof resolve>): void
  onCancel(): void
  /** Keep the editor open and cleared after submitting (inline add). */
  keepOpen?: boolean
  autoFocus?: boolean
}

export function TaskEditor({ initial, submitLabel = 'Add task', onSubmit, onCancel, keepOpen, autoFocus = true }: Props) {
  const data = useData()
  const blank = (): Draft => ({
    content: '', description: '', due: null, deadline: null, priority: 4, labels: [], projectId: inboxId(), sectionId: null, ...initial,
  })
  const [draft, setDraft] = useState<Draft>(blank)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const ctx = useMemo(() => ({
    projects: Object.values(data.projects).map((p) => p.name),
    labels: Object.values(data.labels).map((l) => l.name),
    sections: sectionsOf(data, draft.projectId).map((s) => s.name),
  }), [data, draft.projectId])
  const parsed = useMemo(() => parseQuickAdd(draft.content, ctx), [draft.content, ctx])
  const view = preview(draft, parsed, data)

  const date = usePopover()
  const prio = usePopover()
  const labels = usePopover()
  const project = usePopover()

  const submit = () => {
    if (!parsed.content.trim()) return
    onSubmit(resolve(draft, parsed, data))
    if (keepOpen) setDraft({ ...blank(), projectId: draft.projectId, sectionId: draft.sectionId })
  }

  /** Clears typed tokens so a menu choice takes over. */
  const stripToken = (...types: Token['type'][]) => {
    const drop = parsed.tokens.filter((t) => types.includes(t.type))
    if (!drop.length) return
    set({ content: drop.reduceRight((s, t) => s.slice(0, t.start) + s.slice(t.end), draft.content).replace(/\s+/g, ' ') })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const inTitle = (e.target as HTMLElement).classList.contains('smart-input')
    if (e.key === 'Enter' && ((inTitle && !e.shiftKey) || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  const projectName = view.newProject ?? data.projects[view.projectId]?.name ?? 'Inbox'
  const sectionName = view.newSection ?? (view.sectionId ? data.sections[view.sectionId]?.name : null)
  const labelNames = [...view.labels.map((id) => data.labels[id]?.name), ...view.newLabels].filter(Boolean)

  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <SmartInput
        value={draft.content}
        tokens={parsed.tokens}
        onChange={(content) => set({ content })}
        placeholder="Task name — try “Pay rent every month p1 #Home”"
        autoFocus={autoFocus}
      />
      <textarea
        className="editor-desc"
        rows={1}
        placeholder="Description"
        value={draft.description}
        onChange={(e) => {
          set({ description: e.target.value })
          e.target.style.height = '0'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
      />

      <div className="chips">
        <button className="chip" data-active={!!view.due || undefined} onClick={date.toggle} aria-expanded={date.open}>
          <CalendarDays size={14} />
          {view.due ? formatDue(view.due) : 'Date'}
          {view.due && (
            <span className="chip-x" role="button" aria-label="Remove date" onClick={(e) => (e.stopPropagation(), stripToken('date'), set({ due: null }))}>
              <X size={12} />
            </span>
          )}
        </button>
        {view.deadline && (
          <span className="chip" data-active>
            <Crosshair size={14} /> {formatDate(view.deadline)}
            <span className="chip-x" role="button" aria-label="Remove deadline" onClick={() => (stripToken('deadline'), set({ deadline: null }))}><X size={12} /></span>
          </span>
        )}
        <button className="chip" data-active={view.priority < 4 || undefined} onClick={prio.toggle} aria-expanded={prio.open}>
          <Flag size={14} />
          {view.priority < 4 ? `P${view.priority}` : 'Priority'}
        </button>
        <button className="chip" data-active={labelNames.length > 0 || undefined} onClick={labels.toggle} aria-expanded={labels.open}>
          <Tag size={14} />
          {labelNames.length ? labelNames.map((n) => `@${n}`).join(' ') : 'Labels'}
        </button>
      </div>

      <div className="editor-foot">
        <button className="chip is-plain" onClick={project.toggle} aria-expanded={project.open}>
          <span className="nav-hash">#</span>
          {projectName}{sectionName ? ` / ${sectionName}` : ''}
          <ChevronDown size={14} />
        </button>
        <div className="editor-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!parsed.content.trim()}>{submitLabel}</button>
        </div>
      </div>

      {date.open && (
        <Popover anchor={date.anchor} onClose={date.close} width={290} label="Due date">
          <DatePicker value={view.due} onChange={(due) => (stripToken('date'), set({ due }), date.close())} />
        </Popover>
      )}
      {prio.open && (
        <Popover anchor={prio.anchor} onClose={prio.close} width={200} label="Priority">
          <PriorityPicker value={view.priority} onChange={(priority) => (stripToken('priority'), set({ priority }), prio.close())} />
        </Popover>
      )}
      {labels.open && (
        <Popover anchor={labels.anchor} onClose={labels.close} label="Labels">
          <LabelPicker value={draft.labels} onChange={(ids: ID[]) => set({ labels: ids })} />
        </Popover>
      )}
      {project.open && (
        <Popover anchor={project.anchor} onClose={project.close} width={280} label="Project">
          <ProjectPicker
            projectId={view.projectId}
            sectionId={view.sectionId}
            onChange={(projectId, sectionId) => (stripToken('project', 'section'), set({ projectId, sectionId }), project.close())}
          />
        </Popover>
      )}
      <span className="sr-only" aria-live="polite">{PRIORITY_NAMES[view.priority]}</span>
    </div>
  )
}
