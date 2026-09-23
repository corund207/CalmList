import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { SortableList } from '../components/Sortable'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { runFilter, validateFilter } from '../lib/filter'
import { byOrder, byUrgency, openTasks } from '../lib/select'
import { addFilter, deleteFilter, deleteLabel, reorder, updateFilter, updateLabel } from '../store/actions'
import { useUI } from '../store/ui'

const SUGGESTIONS: [string, string][] = [
  ['Priority 1', 'p1'],
  ['Next 7 days', '7 days'],
  ['Overdue or today', 'overdue | today'],
  ['No date', 'no date'],
  ['Repeating', 'recurring'],
]

function Row({ to, sigil, name, count, favorite, onFavorite, onEdit, onDelete }: {
  to: string; sigil: string; name: string; count: number; favorite?: boolean
  onFavorite(): void; onEdit(): void; onDelete(): void
}) {
  return (
    <div className="fl-row">
      <Link to={to} className="fl-link">
        <span className="nav-hash">{sigil}</span>
        <span className="fl-name">{name}</span>
        <span className="micro">{count}</span>
      </Link>
      <div className="fl-actions">
        <button className="icon-btn" aria-label={favorite ? `Unfavorite ${name}` : `Favorite ${name}`} aria-pressed={!!favorite} onClick={onFavorite}>
          <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-btn" aria-label={`Edit ${name}`} onClick={onEdit}><Pencil size={15} /></button>
        <button className="icon-btn" aria-label={`Delete ${name}`} onClick={onDelete}><Trash2 size={15} /></button>
      </div>
    </div>
  )
}

export function FiltersLabels() {
  const data = useData()
  const { open, toast } = useUI()
  const filters = Object.values(data.filters).sort(byOrder)
  const labels = Object.values(data.labels).sort(byOrder)
  const open$ = useMemo(() => openTasks(data), [data])
  const filterCount = (q: string) => (validateFilter(q) ? 0 : runFilter(q, data).length)

  return (
    <Page title="Filters & Labels">
      <section className="group">
        <header className="group-head">
          <h2>My Filters</h2>
          <button className="icon-btn" aria-label="Add filter" onClick={() => open({ type: 'filter' })}><Plus size={16} /></button>
        </header>
        <SortableList ids={filters.map((f) => f.id)} onReorder={(ids) => reorder('filters', ids)}>
          {(id) => {
            const f = data.filters[id]
            return (
              <Row
                to={`/filter/${f.id}`} sigil="≡" name={f.name} count={filterCount(f.query)} favorite={f.favorite}
                onFavorite={() => updateFilter(f.id, { favorite: !f.favorite })}
                onEdit={() => open({ type: 'filter', id: f.id })}
                onDelete={() => toast(`Deleted filter: ${f.name}`, deleteFilter(f.id))}
              />
            )
          }}
        </SortableList>
        {filters.length === 0 && <p className="fl-empty">Filters are saved searches, like <code>p1 &amp; 7 days</code>.</p>}
        <div className="suggestions">
          {SUGGESTIONS.filter(([, q]) => !filters.some((f) => f.query === q)).map(([name, q]) => (
            <button key={q} className="chip" onClick={() => addFilter(name, q)}><Plus size={12} /> {name}</button>
          ))}
        </div>
      </section>

      <section className="group">
        <header className="group-head">
          <h2>Labels</h2>
          <button className="icon-btn" aria-label="Add label" onClick={() => open({ type: 'label' })}><Plus size={16} /></button>
        </header>
        <SortableList ids={labels.map((l) => l.id)} onReorder={(ids) => reorder('labels', ids)}>
          {(id) => {
            const l = data.labels[id]
            return (
              <Row
                to={`/label/${l.id}`} sigil="@" name={l.name} count={open$.filter((t) => t.labels.includes(l.id)).length} favorite={l.favorite}
                onFavorite={() => updateLabel(l.id, { favorite: !l.favorite })}
                onEdit={() => open({ type: 'label', id: l.id })}
                onDelete={() => toast(`Deleted label: ${l.name}`, deleteLabel(l.id))}
              />
            )
          }}
        </SortableList>
        {labels.length === 0 && <p className="fl-empty">Type @name while adding a task to create a label.</p>}
      </section>
    </Page>
  )
}

export function LabelView() {
  const { id = '' } = useParams()
  const data = useData()
  const label = data.labels[id]
  const tasks = useMemo(() => openTasks(data).filter((t) => t.labels.includes(id)).sort(byUrgency), [data, id])
  if (!label) return <Navigate to="/filters-labels" replace />
  return (
    <Page title={`@${label.name}`} eyebrow={`Label · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}>
      <TaskList tasks={tasks} showProject />
      <InlineAdd defaults={{ labels: [id] }} />
    </Page>
  )
}

export function FilterView() {
  const { id = '' } = useParams()
  const data = useData()
  const open = useUI((s) => s.open)
  const filter = data.filters[id]
  const error = filter ? validateFilter(filter.query) : null
  const tasks = useMemo(() => (filter && !error ? runFilter(filter.query, data).sort(byUrgency) : []), [data, filter, error])
  if (!filter) return <Navigate to="/filters-labels" replace />
  return (
    <Page
      title={filter.name}
      eyebrow={<>Filter · <code>{filter.query}</code> · {tasks.length}</>}
      actions={<button className="icon-btn" aria-label="Edit filter" onClick={() => open({ type: 'filter', id })}><Pencil size={17} /></button>}
    >
      {error ? <p className="fl-empty">This filter has an error: {error}</p> : <TaskList tasks={tasks} showProject />}
      {!error && tasks.length === 0 && (
        <div className="empty"><h2>No matches.</h2><p>Nothing open matches this filter right now.</p></div>
      )}
    </Page>
  )
}
