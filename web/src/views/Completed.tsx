import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Page'
import { useData } from '../hooks'
import { addDays, formatDayHeading, fromISO, toISO, today } from '../lib/dates'
import type { Event } from '../lib/types'
import { toggleTask } from '../store/actions'
import { usePrefs } from '../store/prefs'

const DAYS = 14

/** Consecutive days, ending today (or yesterday if today isn't done yet), that met the goal. */
const streak = (perDay: Map<string, number>, goal: number) => {
  let d = new Date()
  if ((perDay.get(toISO(d)) ?? 0) < goal) d = addDays(d, -1)
  let n = 0
  while ((perDay.get(toISO(d)) ?? 0) >= goal) {
    n++
    d = addDays(d, -1)
  }
  return n
}

function Chart({ perDay, goal }: { perDay: Map<string, number>; goal: number }) {
  const days = Array.from({ length: DAYS }, (_, i) => toISO(addDays(new Date(), i - DAYS + 1)))
  const max = Math.max(goal, ...days.map((d) => perDay.get(d) ?? 0), 1)
  return (
    <figure className="chart">
      <figcaption className="label">Completed per day · last {DAYS} days</figcaption>
      <div className="chart-plot" aria-hidden="true">
        <div className="chart-goal" style={{ bottom: `${(goal / max) * 100}%` }}><span className="micro">Goal {goal}</span></div>
        {days.map((d) => {
          const n = perDay.get(d) ?? 0
          return (
            <div key={d} className="chart-col" data-today={d === today() || undefined}>
              <div className="chart-bar" style={{ height: `${(n / max) * 100}%` }} data-empty={!n || undefined}>
                <span className="chart-tip">{n} on {fromISO(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="chart-axis micro" aria-hidden="true">
        {days.map((d, i) => <span key={d}>{(DAYS - 1 - i) % 2 ? '' : fromISO(d).toLocaleDateString('en-US', { weekday: 'narrow' }) + fromISO(d).getDate()}</span>)}
      </div>
      <table className="sr-only">
        <caption>Tasks completed per day</caption>
        <tbody>{days.map((d) => <tr key={d}><th>{d}</th><td>{perDay.get(d) ?? 0}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}

export function Completed() {
  const data = useData()
  const goal = usePrefs((s) => s.dailyGoal)
  const [limit, setLimit] = useState(60)

  const events = useMemo(() => Object.values(data.events).sort((a, b) => b.createdAt - a.createdAt), [data.events])
  const perDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) {
      const d = toISO(new Date(e.createdAt))
      m.set(d, (m.get(d) ?? 0) + 1)
    }
    return m
  }, [events])

  const weekStart = toISO(addDays(new Date(), -6))
  const stats = [
    { label: 'Today', value: `${perDay.get(today()) ?? 0}/${goal}` },
    { label: 'Streak', value: `${streak(perDay, goal)}d` },
    { label: 'Last 7 days', value: events.filter((e) => toISO(new Date(e.createdAt)) >= weekStart).length },
    { label: 'All time', value: events.length },
  ]

  const groups = new Map<string, Event[]>()
  for (const e of events.slice(0, limit)) {
    const d = toISO(new Date(e.createdAt))
    groups.set(d, [...(groups.get(d) ?? []), e])
  }

  return (
    <Page title="Completed" eyebrow="Activity and progress">
      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <span className="micro">{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      <Chart perDay={perDay} goal={goal} />

      {[...groups].map(([day, list]) => (
        <section key={day} className="group">
          <header className="group-head"><h2>{formatDayHeading(day)}</h2><span className="micro">{list.length}</span></header>
          <ul>
            {list.map((e) => {
              const task = data.tasks[e.taskId]
              const project = data.projects[e.projectId]
              return (
                <li key={e.id} className="activity">
                  <span className="check-mini" data-done />
                  <div className="activity-body">
                    {task ? <Link to={`/project/${task.projectId}?task=${task.id}`}>{e.content}</Link> : <span>{e.content}</span>}
                    <span className="micro">
                      {new Date(e.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {project && ` · ${project.inbox ? 'Inbox' : project.name}`}
                    </span>
                  </div>
                  {task?.completed && <button className="link label" onClick={() => toggleTask(task.id)}>Reopen</button>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {events.length > limit && <button className="btn btn-secondary load-more" onClick={() => setLimit((l) => l + 60)}>Show more</button>}
      {events.length === 0 && <div className="empty"><h2>Nothing yet.</h2><p>Completed tasks and your streak will show up here.</p></div>}
    </Page>
  )
}
