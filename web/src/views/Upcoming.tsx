import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { InlineAdd, TaskList } from '../components/TaskList'
import { useData } from '../hooks'
import { addDays, formatDayHeading, fromISO, startOfDay, toISO, today } from '../lib/dates'
import { openTasks, overdueTasks, byUrgency } from '../lib/select'

const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

export function Upcoming() {
  const data = useData()
  const [weekStart, setWeekStart] = useState(() => monday(startOfDay()))
  const [span, setSpan] = useState(21)
  const t = today()

  const start = weekStart < startOfDay() ? startOfDay() : weekStart
  const days = Array.from({ length: span }, (_, i) => toISO(addDays(start, i)))
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const byDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof openTasks>>()
    for (const task of openTasks(data)) {
      if (!task.due) continue
      const list = map.get(task.due.date) ?? []
      list.push(task)
      map.set(task.due.date, list)
    }
    for (const list of map.values()) list.sort(byUrgency)
    return map
  }, [data])
  const overdue = useMemo(() => overdueTasks(data), [data])

  const jump = (iso: string) => {
    if (iso < toISO(start) || iso > days[days.length - 1]) {
      setWeekStart(monday(fromISO(iso)))
      setSpan(21)
    }
    requestAnimationFrame(() => document.getElementById(`day-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <Page title="Upcoming" eyebrow={weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}>
      <div className="week">
        <button className="icon-btn" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))} disabled={weekStart <= monday(startOfDay())}>
          <ChevronLeft size={18} />
        </button>
        <div className="week-days">
          {week.map((d) => {
            const iso = toISO(d)
            return (
              <button key={iso} className="week-day" data-today={iso === t || undefined} data-past={iso < t || undefined} disabled={iso < t} onClick={() => jump(iso)}>
                <span className="micro">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="week-num">{d.getDate()}</span>
                <span className="week-dot" data-on={(byDay.get(iso)?.length ?? 0) > 0 || undefined} />
              </button>
            )
          })}
        </div>
        <button className="icon-btn" aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          <ChevronRight size={18} />
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => (setWeekStart(monday(startOfDay())), jump(t))}>Today</button>
      </div>

      {overdue.length > 0 && toISO(start) === t && (
        <section className="group">
          <header className="group-head"><h2>Overdue</h2></header>
          <TaskList tasks={overdue} showProject />
        </section>
      )}

      {days.map((iso) => (
        <section key={iso} id={`day-${iso}`} className="group day">
          <header className="group-head"><h2>{formatDayHeading(iso)}</h2></header>
          <TaskList tasks={byDay.get(iso) ?? []} showProject hideDate />
          <InlineAdd defaults={{ due: { date: iso } }} />
        </section>
      ))}
      <button className="btn btn-secondary load-more" onClick={() => setSpan((s) => s + 21)}>Show more days</button>
    </Page>
  )
}
