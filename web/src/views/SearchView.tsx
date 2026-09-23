import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { runFilter, validateFilter } from '../lib/filter'
import { byUrgency } from '../lib/select'
import { addFilter } from '../store/actions'
import { useUI } from '../store/ui'

/** Results for an ad-hoc query from the search palette, savable as a filter. */
export function SearchView() {
  const [params] = useSearchParams()
  const data = useData()
  const toast = useUI((s) => s.toast)
  const q = params.get('q') ?? ''
  const error = validateFilter(q)
  const tasks = useMemo(() => (error ? [] : runFilter(q, data).sort(byUrgency)), [q, data, error])

  return (
    <Page
      title="Search"
      eyebrow={<><code>{q}</code> · {tasks.length} result{tasks.length === 1 ? '' : 's'}</>}
      actions={!error && <button className="btn btn-secondary btn-sm" onClick={() => (addFilter(q, q), toast('Saved as a filter'))}>Save as Filter</button>}
    >
      {error ? <p className="fl-empty">{error}</p> : <TaskList tasks={tasks} showProject />}
      {!error && tasks.length === 0 && <div className="empty"><h2>No matches.</h2><p>Try fewer words, or a filter like “7 days”.</p></div>}
    </Page>
  )
}
