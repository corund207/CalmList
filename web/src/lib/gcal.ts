// Maps tasks to Google Calendar events. Pure, so it is unit tested; the API calls live in store/gcal.ts.
import { addDays, fromISO, toISO } from './dates.ts'
import { rrule } from './ics.ts'
import type { Data, Due, Task } from './types.ts'

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

/** Only open tasks with a date (or date and time) in live projects go to the calendar; ones picked from another calendar are already there. */
export const calendarTasks = (data: Data) =>
  Object.values(data.tasks).filter((t) => !t.completed && t.due && !t.imported && data.projects[t.projectId] && !data.projects[t.projectId].archived)

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
    id: t.calendarEventId ?? eventId(t.id),
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

/* ─── Google → CalmList ─────────────────────────────────────────────────── */

/** An event as the Calendar API returns it: the fields CalmList reads. */
export interface GoogleEvent {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  recurringEventId?: string
  htmlLink?: string
  extendedProperties?: { private?: Record<string, string> }
}

/** When an event happens, in the person's time zone: a date for all-day events, a date and time otherwise. */
export const eventDue = (e: GoogleEvent, timeZone: string): Due | null => {
  if (e.start?.date) return { date: e.start.date }
  if (!e.start?.dateTime) return null
  const at = new Date(e.start.dateTime)
  if (Number.isNaN(at.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** The task an event in the CalmList calendar belongs to, whether CalmList made the event or the task came from it. */
export const taskIdOf = (e: GoogleEvent, data: Data) =>
  e.extendedProperties?.private?.calmlist ?? Object.values(data.tasks).find((t) => t.calendarEventId === e.id)?.id

/**
 * What an edit made in Google changes on its task: the title, and the date and time (a repeat rule stays).
 * Empty when nothing changed, which is how CalmList's own writes echoing back are told apart from edits.
 */
export const taskPatchFromEvent = (e: GoogleEvent, t: Task, timeZone: string): Partial<Task> => {
  const patch: Partial<Task> = {}
  const title = e.summary?.trim()
  if (title && title !== t.content) patch.content = title
  const due = eventDue(e, timeZone)
  if (due && (due.date !== t.due?.date || due.time !== t.due?.time)) patch.due = { ...due, ...(t.due?.recurrence && { recurrence: t.due.recurrence }) }
  return patch
}

/** A new task for a Google event: one added to the CalmList calendar, or one picked from another calendar. */
export const taskFromEvent = (
  e: GoogleEvent,
  o: { id: string; projectId: string; timeZone: string; now: number; pickedFrom?: string },
): Task => ({
  id: o.id,
  createdAt: o.now,
  updatedAt: o.now,
  content: e.summary?.trim() || 'Untitled event',
  description: e.description?.trim() ?? '',
  projectId: o.projectId,
  sectionId: null,
  parentId: null,
  order: o.now,
  priority: 4,
  due: eventDue(e, o.timeZone),
  labels: [],
  completed: false,
  completedAt: null,
  ...(o.pickedFrom ? { imported: { calendarId: o.pickedFrom, eventId: e.id } } : { calendarEventId: e.id }),
})
