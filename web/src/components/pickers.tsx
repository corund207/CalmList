import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../hooks'
import { addDays, formatDue, fromISO, startOfDay, toISO, today } from '../lib/dates'
import { parseDate } from '../lib/parse'
import { describeRecurrence } from '../lib/recurrence'
import { byOrder, projectsSorted, sectionsOf } from '../lib/select'
import type { Due, ID, Priority } from '../lib/types'
import { addLabel } from '../store/actions'

export const PRIORITY_NAMES: Record<Priority, string> = { 1: 'Priority 1', 2: 'Priority 2', 3: 'Priority 3', 4: 'Priority 4' }

/* ─── Date ────────────────────────────────────────────────────────────────── */

const quickDates = () => {
  const now = new Date()
  const sat = addDays(now, ((6 - now.getDay() + 7) % 7) || 7)
  const mon = addDays(now, ((1 - now.getDay() + 7) % 7) || 7)
  return [
    { label: 'Today', date: today() },
    { label: 'Tomorrow', date: toISO(addDays(now, 1)) },
    { label: 'This weekend', date: toISO(sat) },
    { label: 'Next week', date: toISO(mon) },
  ]
}

function Calendar({ value, onPick }: { value?: string; onPick(iso: string): void }) {
  const [month, setMonth] = useState(() => {
    const d = value ? fromISO(value) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7)) // weeks start Monday
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const t = startOfDay()
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="cal">
      <div className="cal-head">
        <span>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div className="cal-grid micro" aria-hidden="true">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="cal-grid">
        {days.map((d) => {
          const iso = toISO(d)
          return (
            <button
              key={iso}
              className="cal-day"
              data-outside={d.getMonth() !== month.getMonth() || undefined}
              data-today={d.getTime() === t.getTime() || undefined}
              data-past={d < t || undefined}
              aria-pressed={iso === value}
              aria-label={d.toDateString()}
              onClick={() => onPick(iso)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DatePicker({ value, onChange }: { value: Due | null; onChange(due: Due | null): void }) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseDate(text) : null), [text])

  return (
    <div className="picker">
      <input
        className="picker-input"
        autoFocus
        placeholder="Type a date: fri 5pm, every mon"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && parsed && onChange(parsed.due)}
      />
      {text.trim() && (
        <div className="picker-preview label">
          {parsed ? `${formatDue(parsed.due)}${parsed.due.recurrence ? ` · ${describeRecurrence(parsed.due.recurrence)}` : ''}` : 'No date found'}
        </div>
      )}
      <div className="menu-list">
        {quickDates().map((q) => (
          <button key={q.label} className="menu-item" onClick={() => onChange({ ...value, date: q.date })}>
            <span>{q.label}</span>
            <span className="micro">{fromISO(q.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
          </button>
        ))}
        {value && <button className="menu-item" onClick={() => onChange(null)}>No date</button>}
      </div>
      <Calendar value={value?.date} onPick={(date) => onChange({ ...value, date })} />
      <div className="picker-row">
        <label className="label" htmlFor="due-time">Time</label>
        <input
          id="due-time"
          type="time"
          className="picker-time"
          value={value?.time ?? ''}
          disabled={!value}
          onChange={(e) => value && onChange({ ...value, time: e.target.value || undefined })}
        />
      </div>
      {value?.recurrence && (
        <div className="picker-row">
          <span className="label">{describeRecurrence(value.recurrence)}</span>
          <button className="link micro" onClick={() => onChange({ ...value, recurrence: undefined })}>Stop repeating</button>
        </div>
      )}
    </div>
  )
}

/* ─── Priority ────────────────────────────────────────────────────────────── */

export function PriorityPicker({ value, onChange }: { value: Priority; onChange(p: Priority): void }) {
  return (
    <div className="menu-list" role="listbox" aria-label="Priority">
      {([1, 2, 3, 4] as Priority[]).map((p) => (
        <button key={p} className="menu-item" role="option" aria-selected={p === value} onClick={() => onChange(p)}>
          <span className="prio-dot" data-priority={p} />
          <span className="grow">{PRIORITY_NAMES[p]}</span>
          {p === value && <Check size={14} />}
        </button>
      ))}
    </div>
  )
}

/* ─── Labels ──────────────────────────────────────────────────────────────── */

export function LabelPicker({ value, onChange }: { value: ID[]; onChange(ids: ID[]): void }) {
  const data = useData()
  const [q, setQ] = useState('')
  const labels = Object.values(data.labels).sort(byOrder)
  const shown = labels.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()))
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase())
  const toggle = (id: ID) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  const create = () => {
    const label = addLabel(q.trim().replace(/\s+/g, '_'))
    onChange([...value, label.id])
    setQ('')
  }

  return (
    <div className="picker">
      <input
        className="picker-input"
        autoFocus
        placeholder="Type a label"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && q.trim() && (exact ? toggle(shown[0].id) : create())}
      />
      <div className="menu-list">
        {shown.map((l) => (
          <button key={l.id} className="menu-item" role="menuitemcheckbox" aria-checked={value.includes(l.id)} onClick={() => toggle(l.id)}>
            <span className="nav-hash">@</span>
            <span className="grow">{l.name}</span>
            {value.includes(l.id) && <Check size={14} />}
          </button>
        ))}
        {q.trim() && !exact && (
          <button className="menu-item" onClick={create}>
            <Plus size={14} /> Create "{q.trim()}"
          </button>
        )}
        {!labels.length && !q && <p className="menu-note">Type to create your first label.</p>}
      </div>
    </div>
  )
}

/* ─── Project + section ───────────────────────────────────────────────────── */

export function ProjectPicker({ projectId, sectionId, onChange }: { projectId: ID; sectionId: ID | null; onChange(projectId: ID, sectionId: ID | null): void }) {
  const data = useData()
  const [q, setQ] = useState('')
  const inbox = Object.values(data.projects).find((p) => p.inbox)
  const projects = [...(inbox ? [inbox] : []), ...projectsSorted(data)]
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase())

  return (
    <div className="picker">
      <input className="picker-input" autoFocus placeholder="Type a project name" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="menu-list is-scroll">
        {projects.map((p) => {
          const sections = sectionsOf(data, p.id).filter((s) => match(s.name) || match(p.name))
          if (!match(p.name) && !sections.length) return null
          return (
            <div key={p.id}>
              <button className="menu-item" onClick={() => onChange(p.id, null)}>
                <span className="nav-hash">#</span>
                <span className="grow">{p.name}</span>
                {p.id === projectId && !sectionId && <Check size={14} />}
              </button>
              {sections.map((s) => (
                <button key={s.id} className="menu-item is-nested" onClick={() => onChange(p.id, s.id)}>
                  <span className="nav-hash">/</span>
                  <span className="grow">{s.name}</span>
                  {s.id === sectionId && <Check size={14} />}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
