import { useMemo } from 'react'
import { Page } from '../components/Page'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { formatDayHeading, today } from '../lib/dates'
import { overdueTasks, tasksOn } from '../lib/select'
import { commit } from '../store/store'
import { useUI } from '../store/ui'

export function Today() {
  const data = useData()
  const toast = useUI((s) => s.toast)
  const t = today()
  const overdue = useMemo(() => overdueTasks(data), [data])
  const due = useMemo(() => tasksOn(data, t), [data, t])
  const total = overdue.length + due.length

  const rescheduleAll = () => {
    const inverse = commit(overdue.map((x) => ({ kind: 'tasks', id: x.id, data: { ...x, due: { ...x.due!, date: t }, updatedAt: Date.now() } })))
    toast(`${overdue.length} task${overdue.length === 1 ? '' : 's'} moved to today`, inverse)
  }

  return (
    <Page title="Today" eyebrow={`${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${total} task${total === 1 ? '' : 's'}`}>
      {overdue.length > 0 && (
        <section className="group">
          <header className="group-head">
            <h2>Overdue</h2>
            <button className="link label" onClick={rescheduleAll}>Reschedule</button>
          </header>
          <TaskList tasks={overdue} showProject />
        </section>
      )}
      <section className="group">
        {overdue.length > 0 && <header className="group-head"><h2>{formatDayHeading(t)}</h2></header>}
        <TaskList tasks={due} showProject hideDate />
        <InlineAdd defaults={{ due: { date: t } }} />
      </section>
      {total === 0 && (
        <div className="empty">
          <h2>A clear day.</h2>
          <p>Everything due today is done. Enjoy it, or press Q to plan something.</p>
        </div>
      )}
    </Page>
  )
}
