// Maps tasks to Google Calendar events. Pure, so it is unit tested; the API calls live in store/gcal.ts.
import { addDays, fromISO, toISO } from './dates'
import { rrule } from './ics'
import type { Data, Task } from './types'

export interface CalendarEvent {
  id: string
  summary: string
  description: string
  start: { date: string } | { dateTime: string; timeZone: string }
  end: { date: string } | { dateTime: string; timeZone: string }
  recurrence?: string[]
  transparency: 'transparent'
  extendedProperties: { private: { calmlist: string } }
}

/** Google event ids allow a–v and 0–9 (base32hex), 5 to 1024 characters. Hex of the task id fits. */
export const eventId = (taskId: string) => `cl${[...new TextEncoder().encode(taskId)].map((b) => b.toString(16).padStart(2, '0')).join('')}`

/** Only open tasks with a date (or date and time) in live projects go to the calendar. */
export const calendarTasks = (data: Data) =>
  Object.values(data.tasks).filter((t) => !t.completed && t.due && data.projects[t.projectId] && !data.projects[t.projectId].archived)

const pad = (n: number) => String(n).padStart(2, '0')
const localDateTime = (d: Date) => `${toISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`

export const toEvent = (t: Task, data: Data, timeZone: string, appUrl: string, minutes = 30): CalendarEvent => {
  const due = t.due!
  const project = data.projects[t.projectId]
  const lines = [t.description, project && !project.inbox ? `Project: ${project.name}` : '', `Open in CalmList: ${appUrl}#/task/${t.id}`]
  let start: CalendarEvent['start']
  let end: CalendarEvent['end']
  if (due.time) {
    const [h, m] = due.time.split(':').map(Number)
    const from = fromISO(due.date)
    from.setHours(h, m, 0, 0)
    start = { dateTime: localDateTime(from), timeZone }
    end = { dateTime: localDateTime(new Date(from.getTime() + minutes * 60_000)), timeZone }
  } else {
    start = { date: due.date }
    end = { date: toISO(addDays(fromISO(due.date), 1)) }
  }
  return {
    id: eventId(t.id),
    summary: t.content,
    description: lines.filter(Boolean).join('\n\n'),
    start,
    end,
    ...(due.recurrence && { recurrence: [rrule(due.recurrence)] }),
    // Tasks are reminders, not meetings: they never block the person's free/busy time.
    transparency: 'transparent',
    extendedProperties: { private: { calmlist: t.id } },
  }
}

/** A stable fingerprint, so unchanged tasks are not sent again. */
export const fingerprint = (e: CalendarEvent) => JSON.stringify([e.summary, e.description, e.start, e.end, e.recurrence ?? null])

export interface SyncPlan {
  upsert: CalendarEvent[]
  remove: string[] // task ids
}

/** What to send, given what was sent last time (task id → fingerprint). */
export const planSync = (data: Data, synced: Record<string, string>, timeZone: string, appUrl: string): SyncPlan => {
  const events = calendarTasks(data).map((t) => toEvent(t, data, timeZone, appUrl))
  const wanted = new Set(events.map((e) => e.extendedProperties.private.calmlist))
  return {
    upsert: events.filter((e) => synced[e.extendedProperties.private.calmlist] !== fingerprint(e)),
    remove: Object.keys(synced).filter((id) => !wanted.has(id)),
  }
}
