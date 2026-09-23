import { LayoutGrid, List } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../hooks'
import { runFilter, validateFilter } from '../lib/filter'
import { addFilter, addLabel, addProject, updateFilter, updateLabel, updateProject } from '../store/actions'
import { useUI } from '../store/ui'
import { Modal } from './Modal'

function Form({ title, submit, disabled, onSubmit, children }: { title: string; submit: string; disabled?: boolean; onSubmit(): void; children: ReactNode }) {
  const close = useUI((s) => s.close)
  const handle = (e: FormEvent) => {
    e.preventDefault()
    if (!disabled) onSubmit()
  }
  return (
    <Modal onClose={close} label={title} size="sm">
      <form className="form" onSubmit={handle}>
        <h2 className="form-title">{title}</h2>
        {children}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={disabled}>{submit}</button>
        </div>
      </form>
    </Modal>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      {label}
    </label>
  )
}

export function ProjectDialog({ id }: { id?: string }) {
  const data = useData()
  const close = useUI((s) => s.close)
  const navigate = useNavigate()
  const existing = id ? data.projects[id] : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const [view, setView] = useState(existing?.view ?? 'list')

  const save = () => {
    if (existing) updateProject(existing.id, { name: name.trim(), favorite, view })
    else navigate(`/project/${addProject(name.trim(), { favorite, view }).id}`)
    close()
  }

  return (
    <Form title={existing ? 'Edit project' : 'Add project'} submit={existing ? 'Save' : 'Add'} disabled={!name.trim()} onSubmit={save}>
      <label className="form-field">
        <span className="micro">Name</span>
        <input className="field" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-field">
        <span className="micro">Layout</span>
        <div className="segmented" role="radiogroup" aria-label="Layout">
          <button type="button" role="radio" aria-checked={view === 'list'} onClick={() => setView('list')}><List size={16} /> List</button>
          <button type="button" role="radio" aria-checked={view === 'board'} onClick={() => setView('board')}><LayoutGrid size={16} /> Board</button>
        </div>
      </div>
      <Toggle checked={favorite} onChange={setFavorite} label="Add to favorites" />
    </Form>
  )
}

export function LabelDialog({ id }: { id?: string }) {
  const data = useData()
  const close = useUI((s) => s.close)
  const existing = id ? data.labels[id] : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const clean = name.trim().replace(/\s+/g, '_').replace(/^@/, '')
  const taken = Object.values(data.labels).some((l) => l.id !== id && l.name.toLowerCase() === clean.toLowerCase())

  const save = () => {
    if (existing) updateLabel(existing.id, { name: clean, favorite })
    else updateLabel(addLabel(clean).id, { favorite })
    close()
  }

  return (
    <Form title={existing ? 'Edit label' : 'Add label'} submit={existing ? 'Save' : 'Add'} disabled={!clean || taken} onSubmit={save}>
      <label className="form-field">
        <span className="micro">Name</span>
        <input className="field" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        {taken && <span className="form-hint">A label with that name already exists.</span>}
      </label>
      <Toggle checked={favorite} onChange={setFavorite} label="Add to favorites" />
    </Form>
  )
}

export function FilterDialog({ id }: { id?: string }) {
  const data = useData()
  const close = useUI((s) => s.close)
  const navigate = useNavigate()
  const existing = id ? data.filters[id] : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [query, setQuery] = useState(existing?.query ?? '')
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const error = query.trim() ? validateFilter(query) : null
  const count = query.trim() && !error ? runFilter(query, data).length : null

  const save = () => {
    if (existing) updateFilter(existing.id, { name: name.trim(), query: query.trim(), favorite })
    else {
      const f = addFilter(name.trim(), query.trim())
      if (favorite) updateFilter(f.id, { favorite })
      navigate(`/filter/${f.id}`)
    }
    close()
  }

  return (
    <Form title={existing ? 'Edit filter' : 'Add filter'} submit={existing ? 'Save' : 'Add'} disabled={!name.trim() || !query.trim() || !!error} onSubmit={save}>
      <label className="form-field">
        <span className="micro">Name</span>
        <input className="field" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="micro">Query</span>
        <input className="field is-mono" value={query} placeholder="(today | overdue) & #Work" onChange={(e) => setQuery(e.target.value)} />
        <span className="form-hint" data-error={!!error || undefined}>
          {error ?? (count !== null ? `${count} matching task${count === 1 ? '' : 's'}` : 'Combine terms with & | ! and ( ).')}
        </span>
      </label>
      <Toggle checked={favorite} onChange={setFavorite} label="Add to favorites" />
    </Form>
  )
}

export function ConfirmDialog({ title, body, action, onConfirm }: { title: string; body: string; action: string; onConfirm(): void }) {
  const close = useUI((s) => s.close)
  return (
    <Form title={title} submit={action} onSubmit={() => (onConfirm(), close())}>
      <p className="form-body">{body}</p>
    </Form>
  )
}
